// === GRAMMY_DEPENDENCIES ===

require('dotenv').config()
const { Bot, InlineKeyboard } = require('grammy')
const { hydrate } = require('@grammyjs/hydrate')


// === SQLTE3_DEPENDENCIES ===

const sqlite3 = require('sqlite3').verbose()

class DbManager {
    constructor(dbPath) {
        this.db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, err => err ? console.error(err.message) : null )
        this.initializeDatabase()
    }

    initializeDatabase() {
        const sql = `
        CREATE TABLE IF NOT EXISTS users(
            table_id INTEGER PRIMARY KEY,
            tg_id INTEGER UNIQUE,
            first_name TEXT,
            last_name TEXT,
            username TEXT,
            language_code TEXT,
            is_authorized INTEGER DEFAULT 0
        )`
        this.db.run(sql, err => err ? console.error(err.message) : null)
    }

    async getUserDetails() {
        const sql = `SELECT tg_id, first_name FROM users`
        return new Promise( (res, reg) => {
            this.db.all(sql, [], (err, rows) => {
                if (err) { 
                    console.error(err.message) 
                    reg(err) 
                } else res(rows)
            })
        })
    }

    authorizeUser(tg_id) {
        const sql = `UPDATE users SET is_authorized = 1 WHERE tg_id = ?`
        this.db.run(sql, [tg_id], function(err) {
            if (err) console.error(err.message)
            else console.log(`Rows updated: ${this.changes}`)
        })
    }
    
    async isUserAuthorized(tg_id) {
        const sql = `SELECT is_authorized FROM users WHERE tg_id = ?`
        return new Promise((resolve, reject) => {
            this.db.get(sql, [tg_id], (err, row) => {
                if (err) {
                    console.error('Database error:', err.message)
                    reject(err)
                } else {
                    console.log(`Authorization check for ${tg_id}: ${row ? row.is_authorized : 'No data'}`)
                    resolve(row ? row.is_authorized === 1 : false)
                }
            })
        })
    }

    async dropTable(table) {
        this.db.run(`DROP TABLE IF EXISTS ${table}`)
    }

    addUser(user, isAuthorized = 0) {
        const sql = `
            INSERT OR IGNORE INTO users(
                tg_id,
                first_name,
                last_name,
                username,
                language_code,
                is_authorized
            ) VALUES (?, ?, ?, ?, ?, ?)`
        this.db.run(sql,
            [
                user.id,
                user.first_name,
                user.last_name,
                user.username,
                user.language_code,
                isAuthorized
            ],
            err => err ? console.error(err.message) : null)
    }

    setAuthorization(tg_id, isAuthorized) {
        const sql = `UPDATE users SET is_authorized = ? WHERE tg_id = ?`
        this.db.run(sql, [isAuthorized, tg_id], err => {
            if (err) {
                console.error(err.message)
            } else {
                console.log(`User ${tg_id} authorization updated to ${isAuthorized}`)
            }
        })
    }

    async getAllUserIDs() {
        const sql = `SELECT tg_id FROM users`
        return new Promise( (resolve, reject) => {
            this.db.all(sql, [], (err, rows) => {
                if (err) {
                    console.error(err.message)
                    reject(err)
                } else {
                    const ids = rows.map(row => row.tg_id)
                    console.log(ids)
                    resolve(ids)
                }
            })
        })
    }
}
class BotController {
    constructor(botApiKey, databaseManager, authorizedUsers) {
        this.bot = new Bot(botApiKey)
        this.bot.use(hydrate())
        this.dbManager = databaseManager
        this.authorizedUsers = authorizedUsers
        this.pendingMessages = new Map()
        this.setupHandlers()
    }

    setupHandlers() {
        this.bot.on('message', async ctx => {
            if (!await this.dbManager.isUserAuthorized(ctx.from.id)) {
                await ctx.reply('Sorry, you are not authorized to send messages.')
                this.dbManager.addUser(ctx.from)
                return
            }

            if (ctx.msg.text || ctx.msg.photo) {
                const messageId = ctx.msg.message_id;
                this.pendingMessages.set(messageId, ctx)

                const keyboard = new InlineKeyboard()
                    .text('Yes, send', `send_${messageId}`)
                    .text('No, cancel', `cancel_${messageId}`)

                await ctx.reply('Do you want to send this message to everyone?', {
                    reply_markup: keyboard
                })
            } else {
                await ctx.reply('Currently, I can only process text messages or messages with a single image.');
            }
        })

        this.bot.callbackQuery(/^send_(\d+)$/, async ctx => {
            const messageId = parseInt(ctx.match[1])
            const messageContext = this.pendingMessages.get(messageId)
            if (messageContext) {
                const userDetails = await this.dbManager.getUserDetails()
                userDetails.forEach(async user => {
                    const customIntroText = `Привет, ${user.first_name}! Новый анонс от «Дамы в потоке» для Тебя ❤️`
                    const keyboard = new InlineKeyboard()
                        .url('Дамы в потоке ❤️', 'https://t.me/damy_v_potoke')
                        .url('Написать Анастасиюшке ❤️', 'https://t.me/anastasia3742')

                    if (messageContext.msg.photo) {
                        // Send photo with custom text and a button
                        const photo = messageContext.msg.photo[messageContext.msg.photo.length - 1].file_id
                        await messageContext.api.sendPhoto(user.tg_id, photo, {
                            caption: `${customIntroText}\n${messageContext.msg.caption || ''}`,
                            reply_markup: keyboard,
                            parse_mode: 'HTML'
                        })
                    } else {
                        // Send text with custom text and a button
                        await messageContext.api.sendMessage(user.tg_id, `${customIntroText}\n${messageContext.msg.text}`, {
                            reply_markup: keyboard,
                            parse_mode: 'HTML',
                            disable_web_page_preview: false
                        })
                    }
                })

                this.pendingMessages.delete(messageId)
                await ctx.answerCallbackQuery("Message sent to all users.")
                await ctx.editMessageText("Message has been sent to all users.")
            } else {
                await ctx.answerCallbackQuery("This message is no longer available.")
            }
        })

        this.bot.callbackQuery(/^cancel_(\d+)$/, async ctx => {
            const messageId = parseInt(ctx.match[1])
            this.pendingMessages.delete(messageId)
            await ctx.answerCallbackQuery("Sending cancelled.")
            await ctx.editMessageText("Sending has been cancelled.")
        })
    }

    start() {
        this.bot.start()
        console.log("Bot started successfully.")
    }
}

const dbManager = new DbManager('./users.db')
const botController = new BotController(process.env.BOT_API_KEY, dbManager)
botController.start()

// добавить приветствие и навигацию
// добавить возможность отписки и повторной подписки
// добавить реагирование на сообщения от юзера
// закинуть проект в гит
// синхронизировать проект между гитом, состоянием на рабочем пк и на домашнем пк
// добавить возможность тестить сообщение перед отправкой всем
// интегрировать hydrate для авторизованного юзера
// интегрировать hydrate для неавторизованного юзера (по необходимости)