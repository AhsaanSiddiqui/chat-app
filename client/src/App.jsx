import React, { useContext } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import { Toaster } from "react-hot-toast";
import { AuthContext } from "../context/AuthContext";
import assets from "./assets/assets";
import CallModal from "./components/CallModal";

const App = () => {
  const { authUser } = useContext(AuthContext);
  const location = useLocation();
  // Keep invite query (?email=&signup=1) when sending guests to login
  const loginWithInvite = `/login${location.search || ""}`;

  return (
    <div
      className="bg-cover bg-no-repeat"
      style={{ backgroundImage: `url(${assets.bgImage})` }}
    >
      <Toaster />
      {authUser && <CallModal />}
      <Routes>
        <Route
          path="/"
          element={
            authUser ? <HomePage /> : <Navigate to={loginWithInvite} replace />
          }
        />
        <Route
          path="/login"
          element={!authUser ? <LoginPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/profile"
          element={
            authUser ? <ProfilePage /> : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </div>
  );
};

export default App;
