import React, { useContext, useState } from "react";
import assets from "../assets/assets";
import { AuthContext } from "../../context/AuthContext";

const LoginPage = () => {
  const [currState, setCurrState] = useState("Sign up");
  const [accountType, setAccountType] = useState("personal"); // personal | office
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [bio, setBio] = useState("");
  const [officeInviteCode, setOfficeInviteCode] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [devCodeHint, setDevCodeHint] = useState("");
  const [step, setStep] = useState("details"); // details | bio | otp
  const [submitting, setSubmitting] = useState(false);

  const { login, requestSignup, verifySignup, resendSignupOtp } =
    useContext(AuthContext);

  const resetSignupFlow = () => {
    setStep("details");
    setOtpCode("");
    setDevCodeHint("");
    setOfficeInviteCode("");
  };

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (currState === "Login") {
      setSubmitting(true);
      await login("login", { email, password });
      setSubmitting(false);
      return;
    }

    // Sign up flow
    if (step === "details") {
      if (accountType === "office" && !officeInviteCode.trim()) {
        return;
      }
      setStep("bio");
      return;
    }

    if (step === "bio") {
      setSubmitting(true);
      try {
        const result = await requestSignup({
          fullName,
          email,
          password,
          bio,
          accountType,
          officeInviteCode,
        });
        if (result.success) {
          setDevCodeHint(result.data?.devCode || "");
          setStep("otp");
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (step === "otp") {
      setSubmitting(true);
      try {
        await verifySignup({ email, code: otpCode });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleResend = async () => {
    if (submitting || !email) return;
    setSubmitting(true);
    try {
      const result = await resendSignupOtp(email);
      if (result.success && result.data?.devCode) {
        setDevCodeHint(result.data.devCode);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center flex items-center justify-center
     gap-8 sm:justify-evenly max-sm:flex-col backdrop-blur-2xl"
    >
      <img src={assets.logo_big} alt="" className="w-[min(30vw,250px)]" />

      <form
        onSubmit={onSubmitHandler}
        className="border-2 bg-white/8 text-white border-gray-500 p-6 flex
     flex-col gap-6 rounded-lg shadow-lg w-[min(92vw,380px)]"
      >
        <h2 className="flex justify-between items-center font-medium text-2xl">
          {currState === "Sign up" && step === "otp"
            ? "Verify email"
            : currState}
          {currState === "Sign up" && step !== "details" && (
            <img
              onClick={() => {
                if (step === "otp") setStep("bio");
                else setStep("details");
              }}
              src={assets.arrow_icon}
              alt=""
              className="w-5 cursor-pointer"
            />
          )}
        </h2>

        {currState === "Sign up" && step === "details" && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAccountType("personal")}
              className={`rounded-lg py-2 text-sm border transition ${
                accountType === "personal"
                  ? "border-violet-400 bg-violet-500/30 text-white"
                  : "border-gray-500 text-gray-300 hover:bg-white/5"
              }`}
            >
              Personal
            </button>
            <button
              type="button"
              onClick={() => setAccountType("office")}
              className={`rounded-lg py-2 text-sm border transition ${
                accountType === "office"
                  ? "border-violet-400 bg-violet-500/30 text-white"
                  : "border-gray-500 text-gray-300 hover:bg-white/5"
              }`}
            >
              Office
            </button>
          </div>
        )}

        {currState === "Sign up" && step === "details" && (
          <input
            onChange={(e) => setFullName(e.target.value)}
            value={fullName}
            type="text"
            className="p-2 border border-gray-500 rounded-md focus:outline-none"
            placeholder="Full Name"
            required
          />
        )}

        {step !== "otp" && step !== "bio" && (
          <>
            <input
              onChange={(e) => setEmail(e.target.value)}
              value={email}
              type="email"
              placeholder={
                accountType === "office" && currState === "Sign up"
                  ? "Work email"
                  : "Email Address"
              }
              required
              className="p-2 border border-gray-500
          rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              onChange={(e) => setPassword(e.target.value)}
              value={password}
              type="password"
              placeholder="Password"
              required
              minLength={6}
              className="p-2 border border-gray-500
          rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </>
        )}

        {currState === "Sign up" &&
          step === "details" &&
          accountType === "office" && (
            <input
              onChange={(e) => setOfficeInviteCode(e.target.value)}
              value={officeInviteCode}
              type="text"
              placeholder="Office invite code"
              required
              className="p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}

        {currState === "Sign up" && step === "bio" && (
          <>
            <p className="text-sm text-gray-300">
              {accountType === "office" ? "Office" : "Personal"} account for{" "}
              <span className="text-violet-300">{email}</span>
            </p>
            <textarea
              onChange={(e) => setBio(e.target.value)}
              value={bio}
              rows={4}
              className="p-2 border border-gray-500
          rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Provide a short bio..."
              required
            />
          </>
        )}

        {currState === "Sign up" && step === "otp" && (
          <>
            <p className="text-sm text-gray-300">
              Enter the 6-digit code sent to{" "}
              <span className="text-violet-300">{email}</span>
            </p>
            <input
              onChange={(e) =>
                setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              value={otpCode}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="6-digit code"
              required
              minLength={6}
              maxLength={6}
              className="p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 tracking-[0.35em] text-center text-lg"
            />
            <button
              type="button"
              onClick={handleResend}
              disabled={submitting}
              className="text-sm text-violet-300 hover:text-violet-200 text-left"
            >
              Resend code
            </button>
            {devCodeHint && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                SMTP not sending yet — temporary code:{" "}
                <span className="font-semibold tracking-widest">{devCodeHint}</span>
              </p>
            )}
          </>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="py-3 bg-gradient-to-r from-purple-400 to-violet-600
         text-white rounded-md cursor-pointer disabled:opacity-60"
        >
          {submitting
            ? "Please wait..."
            : currState === "Login"
              ? "Login Now"
              : step === "details"
                ? "Continue"
                : step === "bio"
                  ? "Send verification code"
                  : "Verify & create account"}
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-500">
          <input type="checkbox" required={currState === "Sign up"} />
          <p>Agree to the terms of use & privacy policy</p>
        </div>

        <div className="flex flex-col gap-2">
          {currState === "Sign up" ? (
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <span
                onClick={() => {
                  setCurrState("Login");
                  resetSignupFlow();
                }}
                className="font-medium text-violet-500 cursor-pointer"
              >
                Login here
              </span>
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              Create an account{" "}
              <span
                onClick={() => {
                  setCurrState("Sign up");
                  resetSignupFlow();
                }}
                className="font-medium text-violet-500 cursor-pointer"
              >
                Click here
              </span>
            </p>
          )}
        </div>
      </form>
    </div>
  );
};

export default LoginPage;
