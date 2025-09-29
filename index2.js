require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// GPLinks API Configuration
const GPLINKS_API_TOKEN = process.env.GPLINKS_API_TOKEN || '1f2ff4688ac2b7cc5c28170a8ba695680bda28a4';

console.log("Bot is running...");

/**
 * Convert Google Drive sharing link to preview link
 */
function convertToGDrivePreviewLink(url) {
  // Match various Google Drive URL formats
  const patterns = [
    /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return `https://drive.google.com/file/d/${match[1]}/preview`;
    }
  }

  return url; // Return original if no match
}

/**
 * Generate GPLinks short URL
 */
async function generateGPLink(longUrl, customAlias = '') {
  try {
    const encodedUrl = encodeURIComponent(longUrl);
    const aliasParam = customAlias ? `&alias=${customAlias}` : '';
    const apiUrl = `https://api.gplinks.com/api?api=${GPLINKS_API_TOKEN}&url=${encodedUrl}${aliasParam}&format=text`;
    
    const response = await axios.get(apiUrl);
    
    if (response.data && typeof response.data === 'string') {
      return response.data.trim();
    }
    
    return null;
  } catch (error) {
    console.error("GPLinks API Error:", error.message);
    return null;
  }
}

/**
 * Extract Google Drive URL from message
 */
function extractGDriveUrl(text) {
  if (!text) return null;
  const match = text.match(/https:\/\/drive\.google\.com[^\s]+/);
  return match ? match[0] : null;
}

/**
 * 1️⃣ START - Show Categories
 */
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Fetch distinct categories
  const { data, error } = await supabase
    .from('media_library')
    .select('category')
    .neq('category', '')
    .order('category', { ascending: true });

  if (error) {
    console.error("Supabase Error:", error.message);
    return bot.sendMessage(chatId, '❌ Error fetching categories.');
  }

  const categories = [...new Set(data.map(item => item.category))];

  const keyboard = {
    reply_markup: {
      inline_keyboard: categories.map(cat => [{ text: cat, callback_data: `cat_${cat}` }])
    }
  };

  bot.sendMessage(chatId, '📂 *Select a Category:*', { parse_mode: 'Markdown', ...keyboard });
});

/**
 * 🔗 Generate GPLink from Google Drive URL
 * Usage: Send a Google Drive URL directly
 */
bot.onText(/https:\/\/drive\.google\.com/, async (msg) => {
  const chatId = msg.chat.id;
  const gdriveUrl = extractGDriveUrl(msg.text);

  if (!gdriveUrl) {
    return bot.sendMessage(chatId, '❌ No valid Google Drive URL found.');
  }

  bot.sendMessage(chatId, '🔄 Generating GPLink...');

  try {
    // Convert to preview link
    const previewUrl = convertToGDrivePreviewLink(gdriveUrl);
    
    // Generate GPLink
    const gpLink = await generateGPLink(previewUrl);

    if (gpLink) {
      bot.sendMessage(
        chatId,
        `✅ *GPLink Generated Successfully!*\n\n📎 Original: ${previewUrl}\n\n🔗 GPLink: ${gpLink}\n\n_Use /update EPISODE_ID ${gpLink} to add to database_`,
        { parse_mode: 'Markdown', disable_web_page_preview: true }
      );
    } else {
      bot.sendMessage(chatId, '❌ Failed to generate GPLink. Please check your API token.');
    }
  } catch (error) {
    console.error("Error generating GPLink:", error);
    bot.sendMessage(chatId, '❌ Error generating GPLink.');
  }
});

/**
 * 🔗 Process forwarded messages with Google Drive links
 */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Skip commands and bulk update mode
  if (msg.text && msg.text.startsWith('/')) return;
  if (bulkUpdateMode[chatId]) return;
  
  // Check if message is forwarded
  if (msg.forward_from || msg.forward_from_chat) {
    const text = msg.text || msg.caption || '';
    const gdriveUrl = extractGDriveUrl(text);
    
    if (gdriveUrl) {
      bot.sendMessage(chatId, '🔄 Processing forwarded message with Google Drive link...');
      
      // Convert to preview link
      const previewUrl = convertToGDrivePreviewLink(gdriveUrl);
      
      // Generate GPLink
      const gpLink = await generateGPLink(previewUrl);

      if (gpLink) {
        bot.sendMessage(
          chatId,
          `✅ *GPLink Generated from Forwarded Message!*\n\n📎 Google Drive: ${previewUrl}\n\n🔗 GPLink: ${gpLink}\n\n_Use /update EPISODE_ID ${gpLink} to add to database_`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      } else {
        bot.sendMessage(chatId, '❌ Failed to generate GPLink.');
      }
    }
  }
});

/**
 * 💾 Update episode URL in database
 * Usage: /update EPISODE_ID URL
 */
bot.onText(/\/update (\d+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const episodeId = match[1];
  const url = match[2].trim();

  const { data, error } = await supabase
    .from('media_library')
    .update({ url: url })
    .eq('id', episodeId)
    .select();

  if (error) {
    console.error("Update Error:", error.message);
    return bot.sendMessage(chatId, '❌ Error updating episode URL in database.');
  }

  if (data && data.length > 0) {
    bot.sendMessage(
      chatId,
      `✅ *Episode Updated Successfully!*\n\n📺 ${data[0].series_name}\n🎬 Episode ${data[0].episode_number}: ${data[0].episode_title}\n\n🔗 New URL: ${url}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } else {
    bot.sendMessage(chatId, '❌ Episode ID not found in database.');
  }
});

/**
 * 🔗 Generate GPLink with custom alias
 * Usage: /gplink URL ALIAS
 */
bot.onText(/\/gplink (.+?)(?: (.+))?$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const url = match[1].trim();
  const alias = match[2] ? match[2].trim() : '';

  bot.sendMessage(chatId, '🔄 Generating GPLink...');

  const gpLink = await generateGPLink(url, alias);

  if (gpLink) {
    bot.sendMessage(
      chatId,
      `✅ *GPLink Generated!*\n\n🔗 ${gpLink}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  } else {
    bot.sendMessage(chatId, '❌ Failed to generate GPLink. Check your URL and API token.');
  }
});

/**
 * 📋 Bulk update with GPLink generation
 * Usage: /bulkupdate
 * Then send: EPISODE_ID,GOOGLE_DRIVE_URL (one per line)
 */
let bulkUpdateMode = {};

bot.onText(/\/bulkupdate/, (msg) => {
  const chatId = msg.chat.id;
  bulkUpdateMode[chatId] = true;
  
  bot.sendMessage(
    chatId,
    '📋 *Bulk Update Mode Activated*\n\nSend episode updates in this format (one per line):\n```\nEPISODE_ID,GOOGLE_DRIVE_URL\nEPISODE_ID,GOOGLE_DRIVE_URL\n```\n\nGPLinks will be generated automatically.\n\nSend /done when finished.',
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/done/, (msg) => {
  const chatId = msg.chat.id;
  if (bulkUpdateMode[chatId]) {
    delete bulkUpdateMode[chatId];
    bot.sendMessage(chatId, '✅ Bulk update mode deactivated.');
  }
});

/**
 * Handle all other messages (bulk update and forwarded messages)
 */
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  
  // Skip commands
  if (msg.text && msg.text.startsWith('/')) return;
  
  // Handle bulk update mode
  if (bulkUpdateMode[chatId] && msg.text) {
    const lines = msg.text.trim().split('\n');
    let successCount = 0;
    let errorCount = 0;

    bot.sendMessage(chatId, `🔄 Processing ${lines.length} episodes...`);

    for (const line of lines) {
      const [episodeId, url] = line.split(',').map(s => s.trim());
      
      if (episodeId && url) {
        try {
          // Convert to preview link if Google Drive
          const previewUrl = url.includes('drive.google.com') 
            ? convertToGDrivePreviewLink(url) 
            : url;
          
          // Generate GPLink
          const gpLink = await generateGPLink(previewUrl);
          
          if (gpLink) {
            const { error } = await supabase
              .from('media_library')
              .update({ url: gpLink })
              .eq('id', episodeId);

            if (error) {
              errorCount++;
              console.error(`Error updating episode ${episodeId}:`, error.message);
            } else {
              successCount++;
            }
          } else {
            errorCount++;
            console.error(`Failed to generate GPLink for episode ${episodeId}`);
          }
        } catch (err) {
          errorCount++;
          console.error(`Error processing episode ${episodeId}:`, err.message);
        }
        
        // Small delay to avoid API rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    bot.sendMessage(
      chatId,
      `📊 *Bulk Update Complete*\n\n✅ Success: ${successCount}\n❌ Errors: ${errorCount}`,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Check if message is forwarded and contains Google Drive link
  if (msg.forward_from || msg.forward_from_chat) {
    const text = msg.text || msg.caption || '';
    const gdriveUrl = extractGDriveUrl(text);
    
    if (gdriveUrl) {
      bot.sendMessage(chatId, '🔄 Processing forwarded message with Google Drive link...');
      
      // Convert to preview link
      const previewUrl = convertToGDrivePreviewLink(gdriveUrl);
      
      // Generate GPLink
      const gpLink = await generateGPLink(previewUrl);

      if (gpLink) {
        bot.sendMessage(
          chatId,
          `✅ *GPLink Generated from Forwarded Message!*\n\n📎 Google Drive: ${previewUrl}\n\n🔗 GPLink: ${gpLink}\n\n_Use /update EPISODE_ID ${gpLink} to add to database_`,
          { parse_mode: 'Markdown', disable_web_page_preview: true }
        );
      } else {
        bot.sendMessage(chatId, '❌ Failed to generate GPLink.');
      }
    }
  }
});

/**
 * 2️⃣ CATEGORY SELECTED - Show Series under that Category
 */
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;

  // CATEGORY STEP
  if (query.data.startsWith('cat_')) {
    const category = query.data.replace('cat_', '');

    const { data, error } = await supabase
      .from('media_library')
      .select('series_name')
      .eq('category', category);

    if (error) {
      console.error("Series Fetch Error:", error.message);
      return bot.sendMessage(chatId, '❌ Error fetching series.');
    }

    const series = [...new Set(data.map(item => item.series_name))];

    const keyboard = {
      reply_markup: {
        inline_keyboard: series.map(s => [{ text: s, callback_data: `series_${category}_${s}` }])
      }
    };

    bot.sendMessage(chatId, `📺 *${category}* - Select a Series:`, { parse_mode: 'Markdown', ...keyboard });
  }

  // SERIES STEP - Show Seasons
  else if (query.data.startsWith('series_')) {
    const [, category, seriesName] = query.data.split('_');

    const { data, error } = await supabase
      .from('media_library')
      .select('season_name')
      .eq('category', category)
      .eq('series_name', seriesName);

    if (error) {
      console.error("Season Fetch Error:", error.message);
      return bot.sendMessage(chatId, '❌ Error fetching seasons.');
    }

    const seasons = [...new Set(data.map(item => item.season_name))];

    const keyboard = {
      reply_markup: {
        inline_keyboard: seasons.map(season => [
          { text: season, callback_data: `season_${category}_${seriesName}_${season}` }
        ])
      }
    };

    bot.sendMessage(chatId, `📀 *${seriesName}* - Select a Season:`, { parse_mode: 'Markdown', ...keyboard });
  }

  // SEASON STEP - Show Episodes
  else if (query.data.startsWith('season_')) {
    const [, category, seriesName, seasonName] = query.data.split('_');

    const { data, error } = await supabase
      .from('media_library')
      .select('id, episode_number, episode_title')
      .eq('category', category)
      .eq('series_name', seriesName)
      .eq('season_name', seasonName)
      .order('episode_number', { ascending: true });

    if (error) {
      console.error("Episode Fetch Error:", error.message);
      return bot.sendMessage(chatId, '❌ Error fetching episodes.');
    }

    const keyboard = {
      reply_markup: {
        inline_keyboard: data.map(ep => [
          { text: `Episode ${ep.episode_number}: ${ep.episode_title}`, callback_data: `ep_${ep.id}` }
        ])
      }
    };

    bot.sendMessage(chatId, `🎬 *${seriesName} - ${seasonName}*\nSelect an Episode:`, { parse_mode: 'Markdown', ...keyboard });
  }

  // EPISODE STEP - Show URL
  else if (query.data.startsWith('ep_')) {
    const episodeId = query.data.replace('ep_', '');

    const { data, error } = await supabase
      .from('media_library')
      .select('series_name, season_name, episode_number, episode_title, url')
      .eq('id', episodeId)
      .single();

    if (error || !data) {
      console.error("Episode URL Fetch Error:", error.message);
      return bot.sendMessage(chatId, '❌ Error fetching episode URL.');
    }

    bot.sendMessage(
      chatId,
      `📺 *${data.series_name}*\n📀 ${data.season_name}\n🎬 Episode ${data.episode_number}: ${data.episode_title}\n\n🔗 [Watch Here](${data.url})`,
      { parse_mode: 'Markdown', disable_web_page_preview: false }
    );
  }
});