require('dotenv').config() // даст доступ к переменной BOT_API_KEY
const {Bot} = require('grammy')

const bot = new Bot(process.env.BOT_API_KEY) // создаем экземплятр класса Бот, куда передаем наш токен для доступа к управлению нашим ботом

bot.command('start', async ctx => await ctx.reply('Привет!')) // отправка произойдет в ответ на команду /start
bot.on('message', async ctx => await ctx.reply('Какой-то месседж')) // отправка произойдет в ответ на любое сообщение. Порядок слушателей важен! 
                                                                    // ...Если этот обработчик будет написан выше обработчика команды /start, то по команде /start сработает ответ "Какой-то месседж"

bot.start() // запуск бота. Обработчики должны быть прописаны ДО команды .start()