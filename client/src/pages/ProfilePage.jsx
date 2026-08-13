import React, { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import assets from "../assets/assets";
import { AuthContext } from "../../context/AuthContext";

const ProfilePage = () => {

  const { authUser, updateProfile } = useContext(AuthContext);

  const [selectedImg, setSeletedImg] = useState(null);
  const navigate = useNavigate();
  const [name, setName] = useState(authUser?.fullName || "");
const [bio, setBio] = useState(authUser?.bio || "");

  const handleSubmit = async (e) =>{
    e.preventDefault();
    if(!selectedImg){
      await updateProfile({fullName: name, bio});
        navigate('/')
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(selectedImg);
    reader.onload = async ()=>{
      const base64Image = reader.result;
      await updateProfile({profilePic: base64Image, fullName: name, bio});
       navigate('/')
    }
  
}

  return (
    <div className="min-h-screen bg-cover bg-no-repeat flex items-center justify-center">
      <div
        className="relative w-5/6 max-w-2xl backdrop-blur-2xl text-gray-300 border-2
      border-gray-600 flex items-center justify-between max-sm:flex-col-reverse rounded-lg"
      >
        <button
          type="button"
          title="Close"
          onClick={() => navigate("/")}
          className="absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-lg text-gray-400 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-10 flex-1">
          <h3 className="text-lg">Profile details</h3>
          <label
            htmlFor="avatar"
            className="flex items-center gap-3 cursor-pointer"
          >
            <input
              onChange={(e) => setSeletedImg(e.target.files[0])}
              type="file"
              id="avatar"
              accept=".png .jpg .jpeg"
              hidden
            />
            <img
              src={
                selectedImg
                  ? URL.createObjectURL(selectedImg)
                  : assets.avatar_icon
              }
              className={`w-12 h-12 ${selectedImg && "rounded-full"}`}
              alt=""
            />
            upload profile image
          </label>
          <input onChange={(e) => setName(e.target.value)} value={name}
          type="text" required placeholder="Your name" className="p-2 border border-gray-500 rounded-md focus:outline-none focus:ring-2 focus:ring-violet-500" />
            <textarea
            onChange={(e) => setBio(e.target.value)}
            value={bio}
            rows={4}
            className="p-2 border border-gray-500
          rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="provide short bio..."
            required
          ></textarea>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="rounded-full border border-gray-500 p-2 text-lg text-gray-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-purple-400 to-violet-600
             text-white rounded-full p-2 text-lg cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
        <img className={`max-w-44 aspect-square rounded-full max-10 max-sm:mt-10 ${selectedImg && "rounded-full"}`} src={authUser?.profilePic || assets.logo_icon} alt="" />
      </div>
    </div>
  );
};

export default ProfilePage;
