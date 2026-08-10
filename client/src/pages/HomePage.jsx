import React, { useContext, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ChatContainer from '../components/ChatContainer'
import RightSidebar from '../components/RightSidebar'
import { ChatContext } from '../../context/ChatContext';
import { ensureNotificationPermission } from '../lib/notifications';

const HomePage = () => {

  const { selectedUser } = useContext(ChatContext)

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  return (
    <div className=" w-full h-screen ">
      <div className={`backdrop-blur-xl  overflow-hidden h-full grid
      ${selectedUser
          ? "grid-cols-1 md:grid-cols-[25%_50%_25%]"
          : "grid-cols-1 md:grid-cols-[30%_70%]"
        }`} >
        <Sidebar />
        <ChatContainer />
        <RightSidebar />
      </div>
    </div>
  )
}

export default HomePage