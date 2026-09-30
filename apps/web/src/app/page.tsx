import { ChatApp } from '@/components/ChatApp';

export default function HomePage() {
  const showTrace = process.env.NEXT_PUBLIC_SHOW_TRACE !== 'false';
  return <ChatApp showTrace={showTrace} />;
}
