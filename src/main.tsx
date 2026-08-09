import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import CheckoutPage from '../components/CheckoutPage'
import ProfilePage from '../components/ProfilePage'
import '../index.css'

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl font-bold text-gray-900">Product Store</Link>
            <div className="flex space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900 px-3 py-2">Home</Link>
              <Link href="/checkout" className="text-gray-600 hover:text-gray-900 px-3 py-2">Checkout</Link>
              <Link href="/profile" className="text-gray-600 hover:text-gray-900 px-3 py-2">Profile</Link>
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Layout />
      <Routes>
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/" element={
          <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="text-center p-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">Product Page</h1>
              <p className="text-gray-600 mb-6">Wall Paste Repair kit - $12.99</p>
              <div className="flex gap-4 justify-center">
                <Link 
                  to="/checkout"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600"
                >
                  Go to Checkout
                </Link>
                <Link 
                  to="/profile"
                  className="inline-flex items-center gap-2 rounded-lg border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                >
                  Profile Settings
                </Link>
              </div>
            </div>
          </div>
        } />
      </Routes>
    </BrowserRouter>
  )
}

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(<App />)