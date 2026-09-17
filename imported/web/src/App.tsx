import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SseProvider } from './context/SseProvider';
import ChatListPage from './pages/ChatListPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  const location = useLocation();
  const isChatOpen = location.pathname.startsWith('/chat/');

  return (
    <SseProvider>
      <div className="app-layout">
        <div className="chat-list-shell" hidden={isChatOpen}>
          <ChatListPage />
        </div>
        <Routes>
          <Route path="/chat/:peerId" element={<ChatPage />} />
          <Route path="/" element={null} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </SseProvider>
  );
}
