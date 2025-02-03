import { useRef, useState, useEffect } from "react";
import { Checkbox, Panel, DefaultButton, TextField, SpinButton } from "@fluentui/react";
import { SparkleFilled } from "@fluentui/react-icons";
import styles from "./Chat.module.css";

import {
    chatApi,
    RetrievalMode,
    ChatAppResponse
} from "../../api";
import { Answer, AnswerError, AnswerLoading } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { ExampleList } from "../../components/Example";
import { UserChatMessage } from "../../components/UserChatMessage";
import { ClearChatButton } from "../../components/ClearChatButton";
import Speech from "../speech/Speech"; // Import Speech component

const Chat = () => {
    const lastQuestionRef = useRef<string>("");
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);
    
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<unknown>();
    const [answers, setAnswers] = useState<[user: string, response: ChatAppResponse][]>([]);

    const makeApiRequest = async (question: string) => {
        lastQuestionRef.current = question;
        setIsLoading(true);
        setError(undefined);

        try {
            const request = { prompt: question, session_id: "1234" };
            const response = await chatApi(request);
            if (!response.body) throw Error("No response body");

            const parsedResponse: ChatAppResponse = await response.json();
            setAnswers([...answers, [question, parsedResponse]]);
        } catch (e) {
            setError(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSpeechResult = (text: string) => {
        lastQuestionRef.current = text;
        makeApiRequest(text);
    };

    return (
        <div className={styles.container}>
            <div className={styles.commandsContainer}>
                <ClearChatButton className={styles.commandButton} onClick={() => setAnswers([])} disabled={!lastQuestionRef.current || isLoading} />
            </div>
            <div className={styles.chatRoot}>
                <div className={styles.chatContainer}>
                    {!lastQuestionRef.current ? (
                        <div className={styles.chatEmptyState}>
                            <SparkleFilled fontSize={"120px"} primaryFill={"rgba(115, 118, 225, 1)"} />
                            <h1 className={styles.chatEmptyStateTitle}>Chat with your data</h1>
                            <h2 className={styles.chatEmptyStateSubtitle}>Ask anything or try an example</h2>
                            <ExampleList onExampleClicked={makeApiRequest} />
                        </div>
                    ) : (
                        <div className={styles.chatMessageStream}>
                            {answers.map((answer, index) => (
                                <div key={index}>
                                    <UserChatMessage message={answer[0]} />
                                    <div className={styles.chatMessageGpt}>
                                        <Answer answer={answer[1]} />
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerLoading />
                                    </div>
                                </>
                            )}
                            {error && (
                                <>
                                    <UserChatMessage message={lastQuestionRef.current} />
                                    <div className={styles.chatMessageGptMinWidth}>
                                        <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current)} />
                                    </div>
                                </>
                            )}
                            <div ref={chatMessageStreamEnd} />
                        </div>
                    )}

                    {/* Chat Input with Speech Button Inside */}
                    <div className={styles.chatInputContainer}>
                        <div className={styles.chatInputWrapper}>
                            <QuestionInput
                                clearOnSend
                                placeholder="Type a message or use voice..."
                                disabled={isLoading}
                                onSend={makeApiRequest}
                            />
                            <Speech onResult={handleSpeechResult} /> {/* Mic button inside input area */}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat;
