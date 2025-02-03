// filepath: apps/chatbot/src/pages/speech/Speech.tsx
import React, { useState } from 'react';
import { Button } from '@fluentui/react-components';

const Speech = ({ onResult }: { onResult: (text: string) => void }) => {
  const [isListening, setIsListening] = useState(false);

  const handleSpeechRecognition = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      const speechResult = event.results[0][0].transcript;
      onResult(speechResult);
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <Button onClick={handleSpeechRecognition} disabled={isListening}>
      {isListening ? 'Listening...' : 'Start Speaking'}
    </Button>
  );
};

export default Speech;