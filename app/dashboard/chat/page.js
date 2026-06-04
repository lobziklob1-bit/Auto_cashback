'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getActiveCategories, getUserProfile } from '@/lib/firestore';
import { askWhichCardToUse } from '@/lib/ai';
import styles from './chat.module.css';

export default function ChatPage() {
  const { user } = useAuth();
  const [activeCategories, setActiveCategories] = useState(null);
  const [userBanks, setUserBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'model',
      text: 'Привет! 👋 Я твой личный ИИ-помощник по кешбэку. Спроси меня, какой картой выгоднее оплатить покупку, например: «Хочу подстричься, с какой карты платить?» или «Где заправить машину?» 💳'
    }
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  // Автопрокрутка вниз
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Загрузка истории чата из localStorage при входе пользователя
  useEffect(() => {
    if (!user) return;
    const storageKey = `chat_history_${user.uid}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Ошибка парсинга истории чата из localStorage:', e);
      }
    }
  }, [user]);

  // Сохранение истории чата в localStorage при изменении сообщений
  useEffect(() => {
    if (!user || messages.length === 0) return;
    const cleanMessages = messages.filter(m => m.id !== 'typing');
    const storageKey = `chat_history_${user.uid}`;
    localStorage.setItem(storageKey, JSON.stringify(cleanMessages));
  }, [messages, user]);

  // Загрузка активных категорий и банков
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      
      const [catsRes, profileRes] = await Promise.all([
        getActiveCategories(user.uid),
        getUserProfile(user.uid)
      ]);

      if (catsRes.success && catsRes.data) {
        setActiveCategories(catsRes.data.categories || {});
      }
      
      if (profileRes.success && profileRes.data) {
        setUserBanks(profileRes.data.banks || []);
      }

      setLoading(false);
    }
    loadData();
  }, [user]);

  // Отправка сообщения
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || sending) return;

    if (!textToSend) setInput('');
    setSending(true);

    const userMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text
    };

    setMessages(prev => [...prev, userMessage]);

    // Имитация задержки печати
    const typingMessage = {
      id: 'typing',
      role: 'model',
      text: 'Думаю...',
      isTyping: true
    };
    setMessages(prev => [...prev, typingMessage]);

    // Запрос к ИИ
    const aiAnswer = await askWhichCardToUse(text, activeCategories, userBanks);

    setMessages(prev => {
      // Удаляем "Думаю..." и вставляем реальный ответ
      const filtered = prev.filter(m => m.id !== 'typing');
      return [...filtered, {
        id: crypto.randomUUID(),
        role: 'model',
        text: aiAnswer
      }];
    });

    setSending(false);
  };

  const handleClearChat = () => {
    if (confirm('Вы уверены, что хотите очистить всю историю переписки?')) {
      const welcomeMessage = [
        {
          id: 'welcome',
          role: 'model',
          text: 'Привет! 👋 Я твой личный ИИ-помощник по кешбэку. Спроси меня, какой картой выгоднее оплатить покупку, например: «Хочу подстричься, с какой карты платить?» или «Где заправить машину?» 💳'
        }
      ];
      setMessages(welcomeMessage);
      if (user) {
        localStorage.removeItem(`chat_history_${user.uid}`);
      }
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSendMessage();
    }
  };

  const suggestedPrompts = [
    { text: '💇 Хочу подстричься', query: 'Я хочу подстричься, с какой карты платить?' },
    { text: '⛽ Заправить машину', query: 'Мне нужно заправить машину, с какой карты платить?' },
    { text: '🍕 Заказать пиццу', query: 'Хочу заказать пиццу, с какой карты платить?' },
    { text: '💊 Купить лекарства', query: 'Где купить лекарства, какая карта выгоднее?' },
    { text: '🛒 Продукты домой', query: 'Иду за продуктами в супермаркет, какую карту использовать?' }
  ];

  if (loading) {
    return (
      <div className="spinner-overlay">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  // Форматирование ИИ ответа с жирным текстом и переносами строк
  const formatAiMessage = (text) => {
    return text.split('\n').map((paragraph, index) => {
      // Ищем **текст** для выделения жирным
      const parts = paragraph.split('**');
      return (
        <p key={index} style={{ margin: '4px 0', minHeight: '1.2em' }}>
          {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
        </p>
      );
    });
  };

  return (
    <div className={styles.container}>
      <div className={styles.chatWrapper}>
        <div className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '32px' }}>🤖</span>
            <div>
              <h3 style={{ margin: 0 }}>ИИ Кешбэк-Ассистент</h3>
              <span className={styles.statusBadge}>Online | Анализирует {userBanks.length} банков</span>
            </div>
          </div>
          {messages.length > 1 && (
            <button 
              className="btn btn-ghost btn-sm"
              onClick={handleClearChat}
              style={{ fontSize: '12px', color: 'var(--text-secondary)' }}
            >
              🧹 Очистить историю
            </button>
          )}
        </div>

        <div className={styles.messagesContainer}>
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.modelRow}`}
            >
              {msg.role === 'model' && <span className={styles.avatar}>🤖</span>}
              <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.modelBubble}`}>
                {msg.isTyping ? (
                  <div className={styles.typingIndicator}>
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                ) : (
                  formatAiMessage(msg.text)
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Подсказки чипсы */}
        {messages.length === 1 && (
          <div className={styles.suggestionsContainer}>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '8px' }}>
              Частые запросы пользователей:
            </p>
            <div className={styles.suggestions}>
              {suggestedPrompts.map((prompt, idx) => (
                <button 
                  key={idx} 
                  className={styles.chip}
                  onClick={() => handleSendMessage(prompt.query)}
                  disabled={sending}
                >
                  {prompt.text}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={styles.inputWrapper}>
          <input
            type="text"
            className="input"
            placeholder="Введите ваш вопрос (например, 'Где выгоднее заправить авто?')..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={sending}
          />
          <button 
            className="btn btn-primary"
            style={{ padding: '12px 24px', borderRadius: '12px' }}
            onClick={() => handleSendMessage()}
            disabled={sending || !input.trim()}
          >
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
