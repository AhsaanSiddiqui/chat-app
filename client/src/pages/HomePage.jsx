import React, { useContext, useEffect } from 'react'
import Sidebar from '../components/Sidebar'
import ChatContainer from '../components/ChatContainer'
import RightSidebar from '../components/RightSidebar'
import { ChatContext } from '../../context/ChatContext';
import { ensureNotificationPermission } from '../lib/notifications';

const HomePage = () => {

  const { selectedUser, selectedGroup } = useContext(ChatContext)
  const hasOpenChat = !!(selectedUser || selectedGroup)

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  return (
    <div className=" w-full h-screen ">
      <div className={`backdrop-blur-xl  overflow-hidden h-full grid
      ${hasOpenChat
          ? "grid-cols-1 md:grid-cols-[20%_62%_18%]"
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