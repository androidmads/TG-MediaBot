require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Start Command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Fetch menus from Supabase
  const { data: menus, error } = await supabase.from('menus').select('*');

  if (error || !menus.length) {
    return bot.sendMessage(chatId, '⚠ No menus found or error fetching data.');
  }

  // Create inline keyboard
  const keyboard = {
    reply_markup: {
      inline_keyboard: menus.map(menu => [
        { text: menu.name, callback_data: `menu_${menu.id}` }
      ])
    }
  };

  bot.sendMessage(chatId, '📂 Select a menu:', keyboard);
});

// Handle Menu Selection
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const menuId = query.data.replace('menu_', '');

  // Fetch single menu item
  const { data: menu, error } = await supabase
    .from('menus')
    .select('*')
    .eq('id', menuId)
    .single();

  if (error || !menu) {
    return bot.sendMessage(chatId, '⚠ Error fetching menu item.');
  }

  bot.sendMessage(chatId, `🔗 Here is your link for *${menu.name}*: \n${menu.url}`, {
    parse_mode: 'Markdown'
  });
});
