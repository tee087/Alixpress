"use client"

import { useState, useEffect } from 'react'
import { Bot, Check, X, MessageCircle, Loader2, RefreshCw, UserPlus, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'

interface User {
  id: string
  name: string
  email: string
  telegramChatId?: string
  telegramConnected: boolean
}

interface TelegramAuthResponse {
  authUrl: string
  connected: boolean
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [connectingTelegram, setConnectingTelegram] = useState(false)
  const [requestingSignIn, setRequestingSignIn] = useState(false)
  const [requestingRegister, setRequestingRegister] = useState(false)

  useEffect(() => {
    fetchUser()
  }, [])

  const fetchUser = async () => {
    try {
      const storedUser = localStorage.getItem('user')
      if (storedUser) {
        setUser(JSON.parse(storedUser))
      } else {
        setUser({
          id: 'user-001',
          name: 'John Doe',
          email: 'john.doe@example.com',
          telegramChatId: null,
          telegramConnected: false,
        })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const connectTelegram = async () => {
    setConnectingTelegram(true)
    
    try {
      const response = await fetch('/api/auth/telegram-link?returnUrl=/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to get Telegram auth URL')
      }
      
      const data: TelegramAuthResponse = await response.json()
      
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=800')
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to connect Telegram')
    } finally {
      setConnectingTelegram(false)
    }
  }

  const requestSignIn = async () => {
    setRequestingSignIn(true)
    
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId: user?.id, 
          email: user?.email 
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to request sign in')
      }
      
      toast.success('Sign in request sent to Telegram. An admin will approve.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request sign in')
    } finally {
      setRequestingSignIn(false)
    }
  }

  const requestRegister = async () => {
    setRequestingRegister(true)
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: user?.email,
          name: user?.name 
        }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to request registration')
      }
      
      toast.success('Registration request sent to Telegram. An admin will approve.')
    } catch (err: any) {
      toast.error(err.message || 'Failed to request registration')
    } finally {
      setRequestingRegister(false)
    }
  }

  const checkTelegramStatus = async () => {
    try {
      const response = await fetch(`/api/users/${user?.id}`)
      const updatedUser = await response.json()
      setUser(updatedUser)
      toast.success('Telegram connection verified!')
    } catch (err) {
      toast.error('Failed to verify connection')
    }
  }

  if (loading) {
    return (
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>
          <p className="text-sm text-gray-500">Manage your account and notification preferences</p>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Full Name</label>
                <input
                  type="text"
                  defaultValue={user?.name || 'John Doe'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 uppercase tracking-wide mb-1">Email</label>
                <input
                  type="email"
                  defaultValue={user?.email || 'john.doe@example.com'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-blue-500" />
                Telegram Integration
              </h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                      <Bot className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">Telegram Bot</p>
                      <p className="text-sm text-gray-500">Approve actions via Telegram bot</p>
                    </div>
                  </div>
                  
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${
                    user?.telegramConnected 
                      ? 'bg-green-50 text-green-700' 
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {user?.telegramConnected ? (
                      <>
                        <Check className="h-4 w-4" />
                        Connected
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4" />
                        Not Connected
                      </>
                    )}
                  </span>
                </div>

                <button
                  onClick={user?.telegramConnected ? checkTelegramStatus : connectTelegram}
                  disabled={connectingTelegram}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                >
                  {connectingTelegram ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {user?.telegramConnected ? 'Verifying...' : 'Connecting...'}
                    </>
                  ) : (
                    <>
                      <MessageCircle className="h-4 w-4" />
                      {user?.telegramConnected ? 'Verify Connection' : 'Connect Telegram'}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <LogIn className="h-5 w-5 text-blue-500" />
                  Sign In via Telegram
                </h3>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Request sign in approval through your Telegram bot
                  </p>
                  
                  <button
                    onClick={requestSignIn}
                    disabled={requestingSignIn || !user?.telegramConnected}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requestingSignIn ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      <>
                        <LogIn className="h-4 w-4" />
                        Request Sign In
                      </>
                    )}
                  </button>
                  
                  {!user?.telegramConnected && (
                    <p className="text-xs text-amber-600">Connect Telegram first to use sign in approval</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-blue-500" />
                  Register via Telegram
                </h3>
                
                <div className="space-y-4">
                  <p className="text-sm text-gray-600">
                    Request new account registration approval through Telegram
                  </p>
                  
                  <button
                    onClick={requestRegister}
                    disabled={requestingRegister || !user?.telegramConnected}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requestingRegister ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Requesting...
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        Request Registration
                      </>
                    )}
                  </button>
                  
                  {!user?.telegramConnected && (
                    <p className="text-xs text-amber-600">Connect Telegram first to use registration approval</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {user?.telegramConnected && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                <strong>Connected Telegram Chat ID:</strong> <code className="text-xs">{user.telegramChatId}</code>
              </p>
              <p className="text-sm text-blue-700">
                You will receive notifications for:
              </p>
              <ul className="text-sm text-blue-700 mt-1 space-y-1 list-disc list-inside">
                <li>Checkout approval requests</li>
                <li>Sign in requests</li>
                <li>Registration requests</li>
                <li>Cart item additions</li>
              </ul>
            </div>
          )}

          {!user?.telegramConnected && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-4">
              <p className="text-sm text-amber-800 mb-2">
                <strong>Tip:</strong> Connecting your Telegram account allows you to approve checkouts, sign ins, and registrations directly from your phone.
              </p>
            </div>
          )}

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Email Notifications</label>
                <input type="checkbox" defaultChecked className="w-10 h-5 bg-gray-200 rounded-full cursor-checked:after:rounded-full after:content-[''] after:inline-block after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transform after:translate-y-px focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm text-gray-700">Telegram Notifications</label>
                <input 
                  type="checkbox" 
                  checked={user?.telegramConnected || false}
                  readOnly
                  className="w-10 h-5 bg-gray-200 rounded-full cursor-not-allowed"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}