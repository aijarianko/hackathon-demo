import React, { useState } from 'react';
import { Button } from '@fluentui/react-components';
import { FaMicrophone, FaMicrophoneAltSlash } from 'react-icons/fa'; // Import microphone icons

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
    <Button
      onClick={handleSpeechRecognition}
      disabled={isListening}
      style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
    >
      {isListening ? <FaMicrophoneAltSlash size={24} color="#f00" /> : <FaMicrophone size={24} />}
    </Button>
  );
};

export default Speech;
