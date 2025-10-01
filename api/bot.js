require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// Initialize Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Initialize Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("Bot is running...");

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
    return bot.sendMessage(chatId, error);
  }

  const categories = [...new Set(data.map(item => item.category))];

  const keyboard = {
    reply_markup: {
      inline_keyboard: categories.map(cat => [{ text: cat, callback_data: `cat_${cat}` }])
    }
  };

  bot.sendMessage(chatId, '📂 *Select a Category:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.onText(/\/live/, async (msg) => {
  
  bot.sendMessage(chatId, '📂 *Alive*');
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
          { text: `Episode ${ep.episode_number}`, callback_data: `ep_${ep.id}` }
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

// module.exports = async (req, res) => {
  // if (req.method === 'POST') {
    // bot.processUpdate(req.body);
    // res.status(200).send('ok');
  // } else {
    // res.status(200).send('Bot is running1...');
  // }
// };
