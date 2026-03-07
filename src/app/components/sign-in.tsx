import { useState } from "react";
import { useNavigate } from "react-router";
import { useRecovery } from "./store";
import { ApiRequestError, fetchWithTimeout, readApiError, buildApiUrl } from "../lib/api";
import {
  HeartPulse,
  User,
  Stethoscope,
  Droplets,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Loader2,
  PhoneCall,
  ShieldCheck,
} from "lucide-react";

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

// ── Web Crypto password hashing (SHA-256) — no external libraries ─────────────
async function hashPassword(password: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure password checks require HTTPS or localhost.");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Password strength scorer (0–4)
function scorePassword(pw: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score as 0 | 1 | 2 | 3 | 4;
}

const strengthLabel = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const strengthColor = [
  "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-blue-500", "bg-emerald-500",
];
const strengthText = [
  "text-red-500", "text-orange-500", "text-yellow-600", "text-blue-600", "text-emerald-600",
];

// ─────────────────────────────────────────────────────────────────────────────

type Mode = "login" | "register";

export function SignIn() {
  const navigate = useNavigate();
  const { data, loginAs, setUserProfile, applyCloudSync } = useRecovery();

  const [mode, setMode] = useState<Mode>("register");
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Register form
  const [reg, setReg] = useState({
    name: "",
    doctorName: "",
    doctorMobile: "",
    bloodGroup: "",
    mobile: "",
    password: "",
    confirmPassword: "",
  });

  // Login form
  const [login, setLogin] = useState({ mobile: "", password: "" });

  const pwScore = scorePassword(reg.password);

  // ── Register validation ───────────────────────────────────────────────────
  const validateReg = () => {
    const e: Record<string, string> = {};
    if (!reg.name.trim()) e.name = "Full name is required";
    if (!reg.doctorName.trim()) e.doctorName = "Doctor's name is required";
    if (!reg.doctorMobile.trim()) e.doctorMobile = "Doctor's mobile is required";
    else if (!/^\d{10}$/.test(reg.doctorMobile)) e.doctorMobile = "Enter a valid 10-digit number";
    if (!reg.bloodGroup) e.bloodGroup = "Please select your blood group";
    if (!reg.mobile.trim()) e.mobile = "Your mobile is required";
    else if (!/^\d{10}$/.test(reg.mobile)) e.mobile = "Enter a valid 10-digit number";
    if (!reg.password) e.password = "Password is required";
    else if (reg.password.length < 6) e.password = "Password must be at least 6 characters";
    if (!reg.confirmPassword) e.confirmPassword = "Please confirm your password";
    else if (reg.password !== reg.confirmPassword) e.confirmPassword = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Login validation ──────────────────────────────────────────────────────
  const validateLogin = () => {
    const e: Record<string, string> = {};
    if (!login.mobile.trim()) e.loginMobile = "Mobile number is required";
    else if (!/^\d{10}$/.test(login.mobile)) e.loginMobile = "Enter a valid 10-digit number";
    if (!login.password) e.loginPassword = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Handle Register ───────────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!validateReg()) return;
    setSubmitting(true);
    setErrors({});

    try {
      const hash = await hashPassword(reg.password);
      setUserProfile({
        name: reg.name,
        doctorName: reg.doctorName,
        doctorMobile: reg.doctorMobile,
        bloodGroup: reg.bloodGroup,
        mobile: reg.mobile,
        passwordHash: hash,
        isLoggedIn: true,
        hasUploadedDischarge: false,
      });
      navigate("/onboarding-upload");
    } catch (error) {
      setErrors({
        registerGeneral:
          error instanceof Error ? error.message : "Unable to create your account.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Handle Login ──────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!validateLogin()) return;
    setSubmitting(true);
    setErrors({});

    try {
      const passwordHash = await hashPassword(login.password);
      const storedProfile =
        data.userProfile?.mobile === login.mobile ? data.userProfile : null;
      let cloudError: string | null = null;

      try {
        const fetchUrl = buildApiUrl("/api/pull");
        console.log(`[Diagnostic] Initiating sign-in pull from: ${fetchUrl}`);
        
        const res = await fetchWithTimeout(
          "/api/pull",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mobile: login.mobile }),
          },
          15000 // Increased timeout for potentially slow remote connections
        );

        console.log(`[Diagnostic] Sign-in pull response: ${res.status} ${res.statusText}`);

        if (res.ok) {
          const cloudData = await res.json();

          if (!cloudData?.userProfile?.passwordHash) {
            setErrors({
              loginGeneral: "The recovery server returned an invalid sign-in response.",
            });
            return;
          }

          if (passwordHash !== cloudData.userProfile.passwordHash) {
            setErrors({ loginPassword: "Incorrect password. Please try again." });
            return;
          }

          applyCloudSync({
            ...cloudData,
            userProfile: {
              ...cloudData.userProfile,
              isLoggedIn: true,
            },
          });

          if (cloudData.userProfile.hasUploadedDischarge) {
            navigate("/");
          } else {
            navigate("/onboarding-upload");
          }
          return;
        }

        if (res.status === 404) {
          const errorMessage = await readApiError(
            res,
            "Cloud login endpoint not found."
          );

          if (errorMessage !== "User not found") {
            cloudError = errorMessage;
          }
        } else {
          cloudError = await readApiError(
            res,
            "Unable to sign in with the recovery server right now."
          );
        }
      } catch (error) {
        if (error instanceof ApiRequestError) {
          cloudError = error.message;
        } else {
          cloudError =
            error instanceof Error ? error.message : "Unable to sign in right now.";
        }
      }

      if (storedProfile) {
        if (passwordHash !== storedProfile.passwordHash) {
          setErrors({ loginPassword: "Incorrect password. Please try again." });
          return;
        }

        loginAs(storedProfile);
        if (storedProfile.hasUploadedDischarge) {
          navigate("/");
        } else {
          navigate("/onboarding-upload");
        }
        return;
      }

      if (cloudError) {
        setErrors({
          loginGeneral: `${cloudError} This device does not have a local copy of your account.`,
        });
        return;
      }

      setErrors({
        loginMobile:
          "No account found for this mobile number on this device or in the cloud.",
      });
    } catch (error) {
      setErrors({
        loginGeneral:
          error instanceof Error ? error.message : "Unable to sign in right now.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const setField =
    <K extends keyof typeof reg>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setReg((prev) => ({ ...prev, [key]: e.target.value }));
      if (errors[key] || errors.registerGeneral) {
        setErrors((prev) => ({ ...prev, [key]: "", registerGeneral: "" }));
      }
    };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-7">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary/25">
            <HeartPulse className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-[24px] text-foreground">RecoverWell</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Your intelligent post-surgery recovery assistant
          </p>
        </div>

        <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {(["register", "login"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setErrors({}); }}
                className={`flex-1 py-3.5 text-[14px] font-medium transition-colors ${
                  mode === m
                    ? "text-primary border-b-2 border-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === "register" ? "New Patient" : "Existing Patient"}
              </button>
            ))}
          </div>

          {/* ══ REGISTER ══ */}
          {mode === "register" && (
            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-[17px] text-foreground">Create your account</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Fill in your details to get started with recovery tracking.
                </p>
              </div>

              {/* Full Name */}
              <Field label="Full Name" error={errors.name}>
                <InputIcon icon={<User className="w-4 h-4 text-muted-foreground" />}>
                  <input
                    type="text"
                    value={reg.name}
                    onChange={setField("name")}
                    placeholder="Enter your full name"
                    className={inputCls(errors.name)}
                  />
                </InputIcon>
              </Field>

              {/* Doctor Name */}
              <Field label="Doctor's Name" error={errors.doctorName}>
                <InputIcon icon={<Stethoscope className="w-4 h-4 text-muted-foreground" />}>
                  <input
                    type="text"
                    value={reg.doctorName}
                    onChange={setField("doctorName")}
                    placeholder="Your attending doctor's name"
                    className={inputCls(errors.doctorName)}
                  />
                </InputIcon>
              </Field>

              {/* Doctor Emergency Mobile */}
              <Field
                label={
                  <span>
                    Doctor's Emergency Mobile{" "}
                    <span className="text-[11px] text-red-500 font-medium">(SOS)</span>
                  </span>
                }
                error={errors.doctorMobile}
                hint="Used for the emergency SOS button"
              >
                <div className="flex gap-2">
                  <InputIcon icon={<PhoneCall className="w-4 h-4 text-muted-foreground" />} className="flex-1">
                    <input
                      type="tel"
                      value={reg.doctorMobile}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setReg((p) => ({ ...p, doctorMobile: v }));
                        if (errors.doctorMobile || errors.registerGeneral) {
                          setErrors((p) => ({ ...p, doctorMobile: "", registerGeneral: "" }));
                        }
                      }}
                      placeholder="10-digit number"
                      className={inputCls(errors.doctorMobile)}
                    />
                  </InputIcon>
                  {reg.doctorMobile.length === 10 && (
                    <a
                      href={`tel:${reg.doctorMobile}`}
                      className="flex items-center gap-1 px-3 py-2.5 rounded-lg bg-red-500 text-white text-[12px] font-semibold hover:bg-red-600 transition-colors shrink-0 animate-pulse"
                    >
                      📞 SOS
                    </a>
                  )}
                </div>
              </Field>

              {/* Blood Group + Mobile — side by side */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Blood Group" error={errors.bloodGroup}>
                  <InputIcon icon={<Droplets className="w-4 h-4 text-muted-foreground" />}>
                    <select
                      value={reg.bloodGroup}
                      onChange={setField("bloodGroup")}
                      className={`${inputCls(errors.bloodGroup)} appearance-none ${!reg.bloodGroup ? "text-muted-foreground" : ""}`}
                    >
                      <option value="" disabled>Select</option>
                      {bloodGroups.map((bg) => (
                        <option key={bg} value={bg}>{bg}</option>
                      ))}
                    </select>
                  </InputIcon>
                </Field>

                <Field label="Your Mobile" error={errors.mobile}>
                  <InputIcon icon={<Phone className="w-4 h-4 text-muted-foreground" />}>
                    <input
                      type="tel"
                      value={reg.mobile}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setReg((p) => ({ ...p, mobile: v }));
                        if (errors.mobile || errors.registerGeneral) {
                          setErrors((p) => ({ ...p, mobile: "", registerGeneral: "" }));
                        }
                      }}
                      placeholder="10-digit"
                      className={inputCls(errors.mobile)}
                    />
                  </InputIcon>
                </Field>
              </div>

              {/* Password */}
              <Field label="Create Password" error={errors.password}>
                <InputIcon
                  icon={<Lock className="w-4 h-4 text-muted-foreground" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                >
                  <input
                    type={showPw ? "text" : "password"}
                    value={reg.password}
                    onChange={setField("password")}
                    placeholder="Min. 6 characters"
                    className={inputCls(errors.password)}
                  />
                </InputIcon>
                {/* Strength bar */}
                {reg.password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={`flex-1 h-1 rounded-full transition-colors ${
                            i <= pwScore ? strengthColor[pwScore] : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`text-[11px] ${strengthText[pwScore]}`}>
                      {strengthLabel[pwScore]}
                    </p>
                  </div>
                )}
              </Field>

              {/* Confirm Password */}
              <Field label="Confirm Password" error={errors.confirmPassword}>
                <InputIcon
                  icon={<Lock className="w-4 h-4 text-muted-foreground" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                >
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={reg.confirmPassword}
                    onChange={setField("confirmPassword")}
                    placeholder="Re-enter your password"
                    className={inputCls(errors.confirmPassword)}
                  />
                </InputIcon>
                {reg.confirmPassword && reg.password === reg.confirmPassword && (
                  <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Passwords match
                  </p>
                )}
              </Field>

              <button
                onClick={handleRegister}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                ) : (
                  <>Create Account <ArrowRight className="w-4 h-4" /></>
                )}
              </button>

              {errors.registerGeneral && (
                <p className="text-center text-[12px] text-destructive" role="alert">
                  {errors.registerGeneral}
                </p>
              )}

              <p className="text-center text-[12px] text-muted-foreground">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("login"); setErrors({}); }}
                  className="text-primary font-medium hover:underline"
                >
                  Log in here
                </button>
              </p>
            </div>
          )}

          {/* ══ LOGIN ══ */}
          {mode === "login" && (
            <div className="p-6 space-y-5">
              <div>
                <h2 className="text-[17px] text-foreground">Welcome back</h2>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Log in to continue your recovery journey.
                </p>
              </div>

              {/* Mobile */}
              <Field label="Registered Mobile Number" error={errors.loginMobile}>
                <InputIcon icon={<Phone className="w-4 h-4 text-muted-foreground" />}>
                  <input
                    type="tel"
                    value={login.mobile}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setLogin((p) => ({ ...p, mobile: v }));
                      if (errors.loginMobile || errors.loginGeneral) {
                        setErrors((p) => ({ ...p, loginMobile: "", loginGeneral: "" }));
                      }
                    }}
                    placeholder="10-digit mobile number"
                    className={inputCls(errors.loginMobile)}
                  />
                </InputIcon>
              </Field>

              {/* Password */}
              <Field label="Password" error={errors.loginPassword}>
                <InputIcon
                  icon={<Lock className="w-4 h-4 text-muted-foreground" />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                >
                  <input
                    type={showPw ? "text" : "password"}
                    value={login.password}
                    onChange={(e) => {
                      setLogin((p) => ({ ...p, password: e.target.value }));
                      if (errors.loginPassword || errors.loginGeneral) {
                        setErrors((p) => ({ ...p, loginPassword: "", loginGeneral: "" }));
                      }
                    }}
                    placeholder="Your password"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className={inputCls(errors.loginPassword)}
                  />
                </InputIcon>
              </Field>

              <button
                onClick={handleLogin}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg text-[14px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Logging in…</>
                ) : (
                  <><ShieldCheck className="w-4 h-4" /> Log In</>
                )}
              </button>

              {errors.loginGeneral && (
                <p className="text-center text-[12px] text-destructive" role="alert">
                  {errors.loginGeneral}
                </p>
              )}

              <p className="text-center text-[12px] text-muted-foreground">
                New patient?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("register"); setErrors({}); }}
                  className="text-primary font-medium hover:underline"
                >
                  Create an account
                </button>
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-muted-foreground mt-5">
          Your data is stored securely on your device. No data is shared externally.
        </p>
      </div>
    </div>
  );
}

// ── Small reusable helpers ────────────────────────────────────────────────────

function Field({
  label,
  error,
  hint,
  children,
}: {
  label: React.ReactNode;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-[13px] text-muted-foreground block mb-1.5">{label}</label>
      {children}
      {error && <p className="text-[12px] text-destructive mt-1">{error}</p>}
      {!error && hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function InputIcon({
  icon,
  trailing,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</span>
      <div className="[&>input]:pl-10 [&>input]:pr-10 [&>select]:pl-10 [&>select]:pr-4">{children}</div>
      {trailing}
    </div>
  );
}

function inputCls(error?: string) {
  return `w-full py-2.5 rounded-lg border bg-input-background text-[14px] outline-none transition-colors ${
    error
      ? "border-destructive focus:border-destructive"
      : "border-border focus:border-primary"
  }`;
}
