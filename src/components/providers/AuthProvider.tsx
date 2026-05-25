"use client";

import React, { useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user, setUser, isLoading, setLoading, logout } = useStore();
  const { toast } = useToast();
  const [authView, setAuthView] = useState<"login" | "signup" | "forgot">("login");

  // Form states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          
          // Verify user on backend and sync Firestore record
          const response = await fetch("/api/auth/profile", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          });

          if (!response.ok) {
            throw new Error("Failed to verify backend session profile");
          }

          const data = await response.json();
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || "",
            role: data.profile.role,
            clientIds: data.profile.clientIds || [],
            displayName: data.profile.displayName || firebaseUser.displayName || "",
          });
        } catch (error) {
          console.error("Auth Session Sync Error:", error);
          toast("Session sync error: Please log in again.", "error");
          await signOut(auth);
          logout();
        }
      } else {
        logout();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setUser, setLoading, logout, toast]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast("Please fill in all fields", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast("Successfully logged in!", "success");
    } catch (error: any) {
      console.error(error);
      let msg = "Invalid credentials. Please try again.";
      if (error.code === "auth/user-not-found") msg = "No user found with this email.";
      if (error.code === "auth/wrong-password") msg = "Incorrect password.";
      toast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !name) {
      toast("Please fill in all fields", "warning");
      return;
    }

    if (password !== confirmPassword) {
      toast("Passwords do not match", "warning");
      return;
    }

    if (password.length < 6) {
      toast("Password must be at least 6 characters", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      toast("Account created successfully!", "success");
      setAuthView("login");
    } catch (error: any) {
      console.error(error);
      let msg = "Signup failed. Try again.";
      if (error.code === "auth/email-already-in-use") msg = "Email already registered.";
      toast(msg, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast("Please enter your email address", "warning");
      return;
    }

    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast("Password reset link sent to your email!", "success");
      setAuthView("login");
    } catch (error: any) {
      console.error(error);
      toast("Failed to send reset email. Verify address.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Loading Overlay Screen
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center gap-4 z-[9999]">
        <div className="relative flex h-10 w-10">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-10 w-10 bg-primary"></span>
        </div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground animate-pulse">
          Synchronizing Security Keys...
        </h2>
      </div>
    );
  }

  // 2. Gatekeeper screen: Show gorgeous dark glass signup/signin if not logged in
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-slate-900 to-indigo-950/20 text-foreground overflow-y-auto">
        <div className="w-full max-w-md rounded-2xl glass-panel p-8 shadow-2xl relative border border-border">
          {/* Logo Brand Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-foreground to-indigo-400 bg-clip-text text-transparent">
                VeriCRM
              </span>
            </div>
            <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
              ecommerce Verification & operational CRM
            </p>
          </div>

          {/* LOGIN VIEW */}
          {authView === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <h3 className="text-lg font-bold">Sign In</h3>
              <Input
                label="Email Address"
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAuthView("forgot")}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Forgot Password?
                </button>
              </div>
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                Access Platform
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-4">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView("signup");
                    setEmail("");
                    setPassword("");
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Create one now
                </button>
              </p>
            </form>
          )}

          {/* SIGNUP VIEW */}
          {authView === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <h3 className="text-lg font-bold">Create Agency Account</h3>
              <Input
                label="Full Name"
                type="text"
                placeholder="Alex Johnson"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <Input
                label="Email Address"
                type="email"
                placeholder="alex@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="Minimum 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" isLoading={isSubmitting}>
                Register Account
              </Button>
              <p className="text-center text-xs text-muted-foreground mt-4">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAuthView("login");
                    setEmail("");
                    setPassword("");
                  }}
                  className="font-semibold text-primary hover:underline"
                >
                  Sign In
                </button>
              </p>
            </form>
          )}

          {/* FORGOT PASSWORD VIEW */}
          {authView === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <h3 className="text-lg font-bold">Reset Password</h3>
              <p className="text-xs text-muted-foreground">
                Enter your email address and we will mail you a link to reset your credentials.
              </p>
              <Input
                label="Email Address"
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setAuthView("login")}
                >
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" isLoading={isSubmitting}>
                  Send link
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  // 3. User authenticated: Render App layout!
  return <>{children}</>;
};
