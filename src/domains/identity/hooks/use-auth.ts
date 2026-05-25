import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { registerUsername } from '@/domains/identity/lib/username-registry';

export interface UserProfile {
 id: string;
 username: string;
 display_name: string | null;
 avatar_url: string | null;
 bio: string | null;
 is_private: boolean;
 duplicate_threshold_meters: number;
 created_at: string;
 updated_at: string;
}

interface AuthSnapshot {
 user: User | null;
 session: Session | null;
 profile: UserProfile | null;
 loading: boolean;
}

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
 user: null,
 session: null,
 profile: null,
 loading: true,
};

let authSnapshot: AuthSnapshot = INITIAL_AUTH_SNAPSHOT;
let authInitialized = false;
let activeProfileRequestId = 0;
const listeners = new Set<(snapshot: AuthSnapshot) => void>();

function emitAuthSnapshot() {
 for (const listener of listeners) listener(authSnapshot);
}

function setAuthSnapshot(partial: Partial<AuthSnapshot>) {
 authSnapshot = { ...authSnapshot, ...partial };
 emitAuthSnapshot();
}

async function fetchProfileRecord(userId: string): Promise<UserProfile | null> {
 try {
 const { data, error } = await supabase
 .from('profiles')
 .select('*')
 .eq('id', userId)
 .single();

 if (error) {
 console.error('Error fetching profile:', error);
 return null;
 }

 registerUsername(data?.id, data?.username ?? data?.display_name);
 return data as UserProfile;
 } catch (error) {
 console.error('Error in fetchProfile:', error);
 return null;
 }
}

async function refreshSharedProfile(userId: string) {
 const requestId = ++activeProfileRequestId;
 const profile = await fetchProfileRecord(userId);
 if (authSnapshot.user?.id !== userId || requestId !== activeProfileRequestId) return null;
 setAuthSnapshot({ profile });
 return profile;
}

async function applySession(session: Session | null) {
 const user = session?.user ?? null;
 activeProfileRequestId += 1;
 setAuthSnapshot({ session, user, loading: false, profile: user ? authSnapshot.profile : null });

 if (!user) {
 setAuthSnapshot({ profile: null });
 return;
 }

 setTimeout(() => {
 void refreshSharedProfile(user.id);
 }, 0);
}

function ensureAuthInitialized() {
 if (authInitialized) return;
 authInitialized = true;

 const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
 void applySession(session);
 });

 supabase.auth.getSession()
 .then(({ data: { session } }) => applySession(session))
 .catch((error) => {
 console.error('Error getting session:', error);
 setAuthSnapshot({ user: null, session: null, profile: null, loading: false });
 });

 if (typeof window !== 'undefined') {
 window.addEventListener('beforeunload', () => {
 subscription.unsubscribe();
 }, { once: true });
 }
}

export function useAuth() {
 const [state, setState] = useState<AuthSnapshot>(authSnapshot);

 const fetchProfile = useCallback(async (userId: string) => {
 return refreshSharedProfile(userId);
 }, []);

 useEffect(() => {
 ensureAuthInitialized();
 const listener = (snapshot: AuthSnapshot) => setState(snapshot);
 listeners.add(listener);
 listener(authSnapshot);
 return () => {
 listeners.delete(listener);
 };
 }, []);

 useEffect(() => {
 if (typeof window === 'undefined') return;
 const handler = (e: Event) => {
 const detail = (e as CustomEvent<{ userId?: string }>).detail;
 if (!detail?.userId) return;
 if (detail.userId === authSnapshot.user?.id) {
 void refreshSharedProfile(detail.userId);
 }
 };

 window.addEventListener('lovable:profile-updated', handler);
 return () => window.removeEventListener('lovable:profile-updated', handler);
 }, []);

 const signUp = async (email: string, password: string, username?: string) => {
 const redirectUrl = `${window.location.origin}/`;

 const { data, error } = await supabase.auth.signUp({
 email,
 password,
 options: {
 emailRedirectTo: redirectUrl,
 data: {
 username: username || email.split('@')[0],
 }
 }
 });

 if (error) {
 if (error.message.includes('already registered')) {
 toast.error('Este email ya está registrado. ¿Quieres iniciar sesión?');
 } else {
 toast.error(error.message);
 }
 return { error };
 }

 toast.success('¡Cuenta creada! Ya puedes explorar.');
 return { data, error: null };
 };

 const signIn = async (email: string, password: string) => {
 const { data, error } = await supabase.auth.signInWithPassword({
 email,
 password,
 });

 if (error) {
 if (error.message.includes('Invalid login credentials')) {
 toast.error('Email o contraseña incorrectos');
 } else {
 toast.error(error.message);
 }
 return { error };
 }

 return { data, error: null };
 };

 const signInWithGoogle = async () => {
 const { data, error } = await supabase.auth.signInWithOAuth({
 provider: 'google',
 options: {
 redirectTo: `${window.location.origin}/`,
 }
 });

 if (error) {
 toast.error('Error al iniciar sesión con Google');
 return { error };
 }

 return { data, error: null };
 };

 const signOut = async () => {
 const { error } = await supabase.auth.signOut();
 if (error) {
 toast.error('Error al cerrar sesión');
 return { error };
 }

 activeProfileRequestId += 1;
 setAuthSnapshot({ user: null, session: null, profile: null, loading: false });
 toast.success('Sesión cerrada');
 return { error: null };
 };

 const resetPassword = async (email: string) => {
 const redirectUrl = `${window.location.origin}/auth?mode=reset`;

 const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
 redirectTo: redirectUrl,
 });

 if (error) {
 toast.error('Error al enviar el email de recuperación');
 return { error };
 }

 toast.success('¡Email enviado! Revisa tu bandeja de entrada');
 return { data, error: null };
 };

 const updatePassword = async (newPassword: string) => {
 const { data, error } = await supabase.auth.updateUser({
 password: newPassword,
 });

 if (error) {
 toast.error('Error al actualizar la contraseña');
 return { error };
 }

 toast.success('¡Contraseña actualizada correctamente!');
 return { data, error: null };
 };

 const updateProfile = async (updates: Partial<UserProfile>) => {
 if (!state.user) return { error: new Error('No user logged in') };

 const { data, error } = await supabase
 .from('profiles')
 .update(updates)
 .eq('id', state.user.id)
 .select()
 .single();

 if (error) {
 toast.error('Error al actualizar el perfil');
 return { error };
 }

 const nextProfile = data as UserProfile;
 setAuthSnapshot({ profile: nextProfile });

 if (typeof window !== 'undefined') {
 window.dispatchEvent(
 new CustomEvent('lovable:profile-updated', { detail: { userId: state.user.id } })
 );
 }

 toast.success('Perfil actualizado');
 return { data: nextProfile, error: null };
 };

 return {
 user: state.user,
 session: state.session,
 profile: state.profile,
 loading: state.loading,
 signUp,
 signIn,
 signInWithGoogle,
 signOut,
 updateProfile,
 resetPassword,
 updatePassword,
 refreshProfile: () => state.user && fetchProfile(state.user.id),
 };
}
