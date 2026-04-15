import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Mail, Lock, User, Eye, EyeOff, ArrowRight, Globe2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import { z } from 'zod';

// Validation schemas
const emailSchema = z.string().email('Email inválido');
const passwordSchema = z.string()
  .min(8, 'Mínimo 8 caracteres')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número');
const usernameSchema = z.string().min(3, 'Mínimo 3 caracteres').regex(/^[a-zA-Z0-9_]+$/, 'Solo letras, números y guiones bajos');

// Password requirement checks for visual feedback
const passwordRequirements = [
  { label: 'Mínimo 8 caracteres', test: (v: string) => v.length >= 8 },
  { label: 'Una letra minúscula', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Una letra mayúscula', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Un número', test: (v: string) => /[0-9]/.test(v) },
];

// Key for storing "remember me" preference
const REMEMBER_ME_KEY = 'vandits-remember-me';
const REMEMBERED_EMAIL_KEY = 'vandits-remembered-email';

export default function Auth() {
 const [searchParams] = useSearchParams();
 const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [confirmPassword, setConfirmPassword] = useState('');
 const [username, setUsername] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 const [rememberMe, setRememberMe] = useState(false);
 const [isSubmitting, setIsSubmitting] = useState(false);
 const [errors, setErrors] = useState<{ email?: string; password?: string; username?: string; confirmPassword?: string }>({});

 const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword, user, profile, loading } = useAuth();
 const navigate = useNavigate();

  // Check if coming from password reset link
 useEffect(() => {
 const modeParam = searchParams.get('mode');
 if (modeParam === 'reset') {
 setMode('reset');
 }
 }, [searchParams]);

  // Load remembered email on mount
 useEffect(() => {
 try {
 const remembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
 setRememberMe(remembered);
 if (remembered) {
 const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
 if (savedEmail) setEmail(savedEmail);
 }
 } catch {
      // Ignore localStorage errors
 }
 }, []);

  // Redirect if already logged in and show welcome message
 useEffect(() => {
 if (user && !loading) {
      // Show personalized welcome message
 const displayName = profile?.display_name || profile?.username || user.email?.split('@')[0] || 'viajero';
 toast.success(`¡Bienvenido, ${displayName}! `, {
 description: 'Tu aventura continúa...',
 duration: 4000,
 });
 navigate('/', { replace: true });
 }
 }, [user, profile, loading, navigate]);

 const validateForm = () => {
 const newErrors: typeof errors = {};
 
 if (mode === 'forgot') {
 const emailResult = emailSchema.safeParse(email);
 if (!emailResult.success) {
 newErrors.email = emailResult.error.errors[0].message;
 }
 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 }

 if (mode === 'reset') {
 const passwordResult = passwordSchema.safeParse(password);
 if (!passwordResult.success) {
 newErrors.password = passwordResult.error.errors[0].message;
 }
 if (password !== confirmPassword) {
 newErrors.confirmPassword = 'Las contraseñas no coinciden';
 }
 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 }
 
 const emailResult = emailSchema.safeParse(email);
 if (!emailResult.success) {
 newErrors.email = emailResult.error.errors[0].message;
 }
 
 const passwordResult = passwordSchema.safeParse(password);
 if (!passwordResult.success) {
 newErrors.password = passwordResult.error.errors[0].message;
 }
 
 if (mode === 'signup') {
 const usernameResult = usernameSchema.safeParse(username);
 if (!usernameResult.success) {
 newErrors.username = usernameResult.error.errors[0].message;
 }
 }
 
 setErrors(newErrors);
 return Object.keys(newErrors).length === 0;
 };

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault();
 
 if (!validateForm()) return;
 
 setIsSubmitting(true);
 
 try {
      // Handle forgot password
 if (mode === 'forgot') {
 const { error } = await resetPassword(email);
 if (!error) {
 setMode('login');
 }
 return;
 }

      // Handle password reset
 if (mode === 'reset') {
 const { error } = await updatePassword(password);
 if (!error) {
 navigate('/', { replace: true });
 }
 return;
 }

      // Save remember me preference
 if (mode === 'login') {
 localStorage.setItem(REMEMBER_ME_KEY, rememberMe ? 'true' : 'false');
 if (rememberMe) {
 localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
 } else {
 localStorage.removeItem(REMEMBERED_EMAIL_KEY);
 }
 }
 
 if (mode === 'login') {
 const { error } = await signIn(email, password);
 if (!error) {
 navigate('/', { replace: true });
 }
  } else if (mode === 'signup') {
  const { error } = await signUp(email, password, username);
  if (error) {
    if (error.message?.toLowerCase().includes('password') && error.message?.toLowerCase().includes('leaked')) {
      toast.error('Esa contraseña ha sido filtrada en una brecha de datos. Elige otra más segura.');
    }
  } else {
  navigate('/', { replace: true });
  }
  }
 } finally {
 setIsSubmitting(false);
 }
 };

 const handleGoogleLogin = async () => {
 setIsSubmitting(true);
 try {
 await signInWithGoogle();
 } finally {
 setIsSubmitting(false);
 }
 };

  if (loading) {
  return (
  <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
   {/* Left skeleton */}
   <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12">
    <div className="w-24 h-24 rounded-2xl bg-white/5 animate-pulse mb-8" />
    <div className="w-48 h-8 rounded bg-white/5 animate-pulse mb-4" />
    <div className="w-64 h-4 rounded bg-white/5 animate-pulse" />
   </div>
   {/* Right skeleton - form */}
   <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
    <div className="w-full max-w-md space-y-6">
     <div className="w-32 h-6 rounded bg-white/5 animate-pulse mx-auto" />
     <div className="space-y-4">
      <div className="w-full h-10 rounded-lg bg-white/5 animate-pulse" />
      <div className="w-full h-10 rounded-lg bg-white/5 animate-pulse" />
      <div className="w-full h-10 rounded-lg bg-white/10 animate-pulse" />
     </div>
     <div className="w-full h-px bg-white/5" />
     <div className="w-full h-10 rounded-lg bg-white/5 animate-pulse" />
    </div>
   </div>
  </div>
  );
  }

 return (
 <div className="min-h-screen flex bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
 {/* Left side - Branding */}
 <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center p-12 relative overflow-hidden">
 {/* Animated background */}
 <div className="absolute inset-0 opacity-20">
 <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/30 rounded-full blur-3xl animate-pulse" />
 <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/30 rounded-full blur-3xl animate-pulse delay-1000" />
 </div>
 
 <motion.div
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="relative z-10 text-center"
 >
 <motion.div
 initial={{ scale: 0 }}
 animate={{ scale: 1 }}
 transition={{ delay: 0.2, type: 'spring' }}
 className="w-24 h-24 bg-gradient-to-br from-primary to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-2xl"
 >
 <Globe2 className="w-12 h-12 text-white" />
 </motion.div>
 
 <h1 className="text-4xl font-bold text-white mb-4">
 GeoData Social
 </h1>
 <p className="text-xl text-slate-300 max-w-md">
 Comparte tus lugares favoritos, descubre nuevos destinos y conecta con viajeros de todo el mundo.
 </p>
 
 <div className="flex items-center justify-center gap-8 mt-12 text-slate-400">
 <div className="text-center">
 <div className="text-3xl font-bold text-white">2K+</div>
 <div className="text-sm">Lugares</div>
 </div>
 <div className="w-px h-12 bg-slate-600" />
 <div className="text-center">
 <div className="text-3xl font-bold text-white">100+</div>
 <div className="text-sm">Países</div>
 </div>
 <div className="w-px h-12 bg-slate-600" />
 <div className="text-center">
 <div className="text-3xl font-bold text-white">∞</div>
 <div className="text-sm">Aventuras</div>
 </div>
 </div>
 </motion.div>
 </div>

 {/* Right side - Auth form */}
 <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
 <motion.div
 initial={{ opacity: 0, x: 20 }}
 animate={{ opacity: 1, x: 0 }}
 className="w-full max-w-md"
 >
 {/* Mobile logo */}
 <div className="lg:hidden text-center mb-8">
 <div className="w-16 h-16 bg-gradient-to-br from-primary to-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4">
 <MapPin className="w-8 h-8 text-white" />
 </div>
 <h1 className="text-2xl font-bold text-white">GeoData Social</h1>
 </div>

 <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 border border-white/10 shadow-2xl">
 {/* Tab switcher - only show for login/signup */}
 {(mode === 'login' || mode === 'signup') && (
 <div className="flex bg-white/5 rounded-lg p-1 mb-8">
 <button
 onClick={() => setMode('login')}
 className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
 mode === 'login'
 ? 'bg-primary text-white shadow-lg'
 : 'text-slate-400 hover:text-white'
 }`}
 >
 Iniciar Sesión
 </button>
 <button
 onClick={() => setMode('signup')}
 className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
 mode === 'signup'
 ? 'bg-primary text-white shadow-lg'
 : 'text-slate-400 hover:text-white'
 }`}
 >
 Registrarse
 </button>
 </div>
 )}

 {/* Header for forgot/reset modes */}
 {(mode === 'forgot' || mode === 'reset') && (
 <div className="mb-8">
 <button
 onClick={() => setMode('login')}
 className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
 >
 <ArrowLeft className="w-4 h-4" />
 Volver al login
 </button>
 <h2 className="text-xl font-bold text-white">
 {mode === 'forgot' ? 'Recuperar contraseña' : 'Nueva contraseña'}
 </h2>
 <p className="text-slate-400 text-sm mt-1">
 {mode === 'forgot' 
 ? 'Te enviaremos un enlace para restablecer tu contraseña'
 : 'Introduce tu nueva contraseña'}
 </p>
 </div>
 )}

 <AnimatePresence mode="wait">
 <motion.form
 key={mode}
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 onSubmit={handleSubmit}
 className="space-y-5"
 >
 {mode === 'signup' && (
 <div className="space-y-2">
 <Label htmlFor="username" className="text-slate-300">
 Nombre de usuario
 </Label>
 <div className="relative">
 <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="username"
 type="text"
 placeholder="tu_username"
 value={username}
 onChange={(e) => setUsername(e.target.value)}
 className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 </div>
 {errors.username && (
 <p className="text-red-400 text-sm">{errors.username}</p>
 )}
 </div>
 )}

 <div className="space-y-2">
 <Label htmlFor="email" className="text-slate-300">
 Email
 </Label>
 <div className="relative">
 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="email"
 type="email"
 placeholder="tu@email.com"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 </div>
 {errors.email && (
 <p className="text-red-400 text-sm">{errors.email}</p>
 )}
 </div>

 <div className="space-y-2">
 <Label htmlFor="password" className="text-slate-300">
 Contraseña
 </Label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="password"
 type={showPassword ? 'text' : 'password'}
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
 >
 {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
  {errors.password && (
  <p className="text-red-400 text-sm">{errors.password}</p>
  )}
  {(mode === 'signup' || mode === 'reset') && password.length > 0 && (
  <div className="space-y-1 mt-1">
  {passwordRequirements.map((req) => (
    <div key={req.label} className={`flex items-center gap-1.5 text-xs ${req.test(password) ? 'text-emerald-400' : 'text-slate-500'}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${req.test(password) ? 'bg-emerald-400' : 'bg-slate-600'}`} />
      {req.label}
    </div>
  ))}
  </div>
  )}
  </div>
  {/* Forgot password form */}
  {mode === 'forgot' && (
  <div className="space-y-2">
 <Label htmlFor="email" className="text-slate-300">
 Email
 </Label>
 <div className="relative">
 <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="email"
 type="email"
 placeholder="tu@email.com"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 </div>
 {errors.email && (
 <p className="text-red-400 text-sm">{errors.email}</p>
 )}
 </div>
 )}

 {/* Reset password form */}
 {mode === 'reset' && (
 <>
 <div className="space-y-2">
 <Label htmlFor="password" className="text-slate-300">
 Nueva contraseña
 </Label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="password"
 type={showPassword ? 'text' : 'password'}
 placeholder="••••••••"
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 className="pl-10 pr-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
 >
 {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
 </button>
 </div>
 {errors.password && (
 <p className="text-red-400 text-sm">{errors.password}</p>
 )}
 </div>

 <div className="space-y-2">
 <Label htmlFor="confirmPassword" className="text-slate-300">
 Confirmar contraseña
 </Label>
 <div className="relative">
 <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
 <Input
 id="confirmPassword"
 type={showPassword ? 'text' : 'password'}
 placeholder="••••••••"
 value={confirmPassword}
 onChange={(e) => setConfirmPassword(e.target.value)}
 className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-primary"
 />
 </div>
 {errors.confirmPassword && (
 <p className="text-red-400 text-sm">{errors.confirmPassword}</p>
 )}
 </div>
 </>
 )}

 {/* Remember me - only on login */}
 {mode === 'login' && (
 <div className="flex items-center justify-between">
 <div className="flex items-center space-x-2">
 <Checkbox
 id="remember"
 checked={rememberMe}
 onCheckedChange={(checked) => setRememberMe(checked === true)}
 className="border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
 />
 <Label 
 htmlFor="remember" 
 className="text-slate-400 text-sm cursor-pointer select-none"
 >
 Recordarme
 </Label>
 </div>
 <button
 type="button"
 onClick={() => setMode('forgot')}
 className="text-sm text-primary hover:text-primary/80 transition-colors"
 >
 ¿Olvidaste tu contraseña?
 </button>
 </div>
 )}

 <Button
 type="submit"
 disabled={isSubmitting}
 className="w-full bg-gradient-to-r from-primary to-blue-500 hover:from-primary/90 hover:to-blue-500/90 text-white font-medium py-6"
 >
 {isSubmitting ? (
 <motion.div
 animate={{ rotate: 360 }}
 transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
 className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
 />
 ) : (
 <>
 {mode === 'login' && 'Entrar'}
 {mode === 'signup' && 'Crear cuenta'}
 {mode === 'forgot' && 'Enviar enlace'}
 {mode === 'reset' && 'Guardar contraseña'}
 <ArrowRight className="w-5 h-5 ml-2" />
 </>
 )}
 </Button>
 </motion.form>
 </AnimatePresence>

 {/* Divider - only show for login/signup */}
 {(mode === 'login' || mode === 'signup') && (
 <>
 <div className="flex items-center gap-4 my-6">
 <div className="flex-1 h-px bg-white/10" />
 <span className="text-slate-500 text-sm">o continúa con</span>
 <div className="flex-1 h-px bg-white/10" />
 </div>

 {/* Social login */}
 <Button
 type="button"
 variant="outline"
 onClick={handleGoogleLogin}
 disabled={isSubmitting}
 className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white"
 >
 <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
 <path
 fill="currentColor"
 d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
 />
 <path
 fill="currentColor"
 d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
 />
 <path
 fill="currentColor"
 d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
 />
 <path
 fill="currentColor"
 d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
 />
 </svg>
 Google
 </Button>
 </>
 )}
 </div>

 <p className="text-center text-slate-500 text-sm mt-6">
 Al continuar, aceptas nuestros términos de servicio y política de privacidad.
 </p>
 </motion.div>
 </div>
 </div>
 );
}
