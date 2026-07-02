import { Navigate, Route, Routes } from 'react-router-dom';
import ChatListPage from './pages/ChatListPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  return (
    <div className="app-layout">
      <Routes>
        <Route path="/" element={<ChatListPage />} />
        <Route path="/chat/:peerId" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
