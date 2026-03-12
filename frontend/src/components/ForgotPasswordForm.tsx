import React, { useState } from 'react';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import authService from '../services/authService';

interface ForgotPasswordFormProps {
  onBackToLogin: () => void;
  onSwitchToRegister: () => void;
}

const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({ 
  onBackToLogin, 
  onSwitchToRegister 
}) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await authService.forgotPassword(email.trim());
      
      if (result.success) {
        setSuccess(true);
        // In development, show the token
        if (result.reset_token) {
          setResetToken(result.reset_token);
        }
      } else {
        setError(result.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="max-w-md w-full">
          <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">Check Your Email</h1>
              <p className="text-gray-400 mb-6">
                We've sent password reset instructions to <strong>{email}</strong>
              </p>
              
              {/* Development: Show reset token */}
              {resetToken && (
                <div className="mb-6 p-4 bg-gray-700 rounded-lg">
                  <p className="text-white text-sm font-medium mb-2">Development Mode:</p>
                  <p className="text-gray-300 text-xs break-all">{resetToken}</p>
                </div>
              )}
              
              <button
                onClick={onBackToLogin}
                className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-800 transition-colors"
              >
                Back to Login
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full">
        <div className="bg-gray-800 rounded-lg shadow-xl p-8 border border-gray-700">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-2xl font-bold">C</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Reset Password</h1>
            <p className="text-gray-400">Enter your email to receive reset instructions</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-white mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full pl-10 pr-3 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full bg-orange-500 text-white py-3 px-4 rounded-lg font-medium hover:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Sending...' : 'Send Reset Instructions'}
            </button>

            {/* Back to Login */}
            <div className="text-center">
              <button
                type="button"
                onClick={onBackToLogin}
                className="inline-flex items-center text-gray-400 hover:text-gray-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Login
              </button>
            </div>

            {/* Sign Up Link */}
            <div className="text-center">
              <p className="text-gray-400">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  className="text-orange-400 hover:text-orange-300 font-medium transition-colors"
                >
                  Sign up
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordForm;
