require('dotenv').config();
const { MongoClient } = require('mongodb');
const { AgentExecutor } = require("langchain/agents");
const { OpenAIFunctionsAgentOutputParser } = require("langchain/agents/openai/output_parser");
const { formatToOpenAIFunctionMessages } = require("langchain/agents/format_scratchpad");
const { DynamicTool } = require("@langchain/core/tools");
const { RunnableSequence } = require("@langchain/core/runnables");
const { HumanMessage, AIMessage } = require("@langchain/core/messages");
const { MessagesPlaceholder, ChatPromptTemplate } = require("@langchain/core/prompts");
const { convertToOpenAIFunction } = require("@langchain/core/utils/function_calling");
const { ChatOpenAI, OpenAIEmbeddings } = require("@langchain/openai");
const { AzureCosmosDBVectorStore } = require("@langchain/community/vectorstores/azure_cosmosdb");

var dbname = process.env.MONGODB_Name;

class ContosoBikeStoreAgent {
    constructor() {
        this.dbClient = new MongoClient(process.env.MONGODB_CONNECTION_STRING);
        this.embeddings = new OpenAIEmbeddings();
        
        // Define collection-specific search configurations
        this.searchConfigs = {
            store: {
                indexName: "ProductSearchIndex", // Index for product search
                collection: "store"
            },
            documents: {
                indexName: "VectorSearchIndex", // Index for document search
                collection: "documents"
            }
        };

        this.chatModel = new ChatOpenAI({
            temperature: 0,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
            verbose: false,
        });

        this.chatHistory = [];

        (async () => {
            this.agentExecutor = await this.buildAgentExecutor();
        })();
    }

    async vectorSearch(query, collectionType = "documents") {
        try {
            if (!this.dbClient.topology || !this.dbClient.topology.isConnected()) {
                await this.dbClient.connect();
            }

            const config = this.searchConfigs[collectionType];
            if (!config) {
                throw new Error(`Invalid collection type: ${collectionType}`);
            }

            const vectors = await this.embeddings.embedQuery(query);
            const collection = this.dbClient.db(dbname).collection(config.collection);
            
            const searchPipeline = [
                {
                    "$search": {
                        "index": config.indexName,
                        "knnBeta": {
                            "vector": vectors,
                            "path": "contentVector",
                            "k": 4
                        }
                    }
                },
                {
                    "$project": {
                        "_id": 1,
                        "content": 1,
                        "title": 1,
                        "product_name": 1,
                        "description": 1,
                        "price": 1,
                        "category": 1,
                        "metadata": 1,
                        "score": { "$meta": "searchScore" }
                    }
                }
            ];

            const results = await collection.aggregate(searchPipeline).toArray();
            return results.map(doc => ({
                pageContent: doc.content || doc.description || doc._id,
                metadata: {
                    title: doc.title || doc.product_name,
                    price: doc.price,
                    category: doc.category,
                    inventory: doc.stock_quantity,
                    location: rack_location,
                    discounts: doc.discounts,
                    ...doc.metadata
                }
            }));
        } catch (error) {
            console.error(`Vector search error for ${collectionType}:`, error);
            throw error;
        }
    }

    async formatDocuments(docs) {
        if (!Array.isArray(docs) || docs.length === 0) {
            return "No documents found.";
        }

        let strDocs = "";
        for (let index = 0; index < docs.length; index++) {
            let doc = docs[index];
            if (!doc || !doc.metadata) continue;
            
            let docFormatted = { "_id": doc.pageContent };
            Object.assign(docFormatted, doc.metadata);

            if ("contentVector" in docFormatted) {
                delete docFormatted["contentVector"];
            }
            if ("tags" in docFormatted) {
                delete docFormatted["tags"];
            }

            strDocs += JSON.stringify(docFormatted, null, '\t');
            if (index < docs.length - 1) {
                strDocs += ",\n";
            }
        }
        strDocs += "\n\n";
        return strDocs;
    }

    async buildAgentExecutor() {
        const systemMessage = `
            You are a helpful, fun and friendly sales assistant for Kmart Store, a retail supermart store.
    
            Your name is Cosmo.
    
            You are designed to answer questions about the products that Kmart Store sells and act as a assistant for store employee.
    
            If you don't know the answer to a question, respond with "I don't know."
            
            Only answer questions related to Kmart Store products and store employee.
            
            If a question is not related to Kmart Store products, and store employee
            respond with "I only answer questions about Kmart Store"          

            NEVER MAKE UP AN ANSWER.
        `;

        // Create separate retriever functions for different collections
        const productRetriever = async (input) => {
            try {
                const docs = await this.vectorSearch(input, "store");
                return this.formatDocuments(docs);
            } catch (error) {
                console.error("Product retriever error:", error);
                throw error;
            }
        };

        const documentRetriever = async (input) => {
            try {
                const docs = await this.vectorSearch(input, "documents");
                return this.formatDocuments(docs);
            } catch (error) {
                console.error("Document retriever error:", error);
                throw error;
            }
        };

        const productsRetrieverTool = new DynamicTool({
            name: "products_retriever_tool",
            description: `Searches Kmart Store product information for similar products based on the question. 
                    Returns the product information in JSON format.`,
            func: productRetriever,
        });

        const productLookupTool = new DynamicTool({
            name: "product_sku_lookup_tool",
            description: `Searches Kmart Store product information for a single product by its product_name.
                    Returns the product information in JSON format.
                    If the product is not found, returns null.`,
            func: async (input) => {
                try {
                    if (!this.dbClient.topology || !this.dbClient.topology.isConnected()) {
                        await this.dbClient.connect();
                    }
                    
                    const db = this.dbClient.db(dbname);
                    const products = db.collection("store");
                    const doc = await products.findOne({ "product_name": input });
                    if (doc) {
                        delete doc.contentVector;
                    }
                    return doc ? JSON.stringify(doc, null, '\t') : null;
                } catch (error) {
                    console.error("Product lookup error:", error);
                    throw error;
                }
            },
        });

        const documentsRetrieverTool = new DynamicTool({
            name: "documents_retriever_tool",
            description: `Searches the "documents" collection for employment policy, HR policy, leave policy etc.`,
            func: documentRetriever,
        });

        const tools = [productsRetrieverTool, productLookupTool, documentsRetrieverTool];
        const modelWithFunctions = this.chatModel.bind({
            functions: tools.map((tool) => convertToOpenAIFunction(tool)),
        });

        const prompt = ChatPromptTemplate.fromMessages([
            ["system", systemMessage],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad")
        ]);

        const runnableAgent = RunnableSequence.from([
            {
                input: (i) => i.input,
                agent_scratchpad: (i) => formatToOpenAIFunctionMessages(i.steps),
                chat_history: (i) => i.chat_history
            },
            prompt,
            modelWithFunctions,
            new OpenAIFunctionsAgentOutputParser(),
        ]);

        return AgentExecutor.fromAgentAndTools({
            agent: runnableAgent,
            tools,
            returnIntermediateSteps: false,
            verbose: true,
        });
    }

    async executeAgent(input) {
        let returnValue = "";
        try {
            if (!this.dbClient.topology || !this.dbClient.topology.isConnected()) {
                await this.dbClient.connect();
            }
            
            const result = await this.agentExecutor.invoke({ 
                input: input, 
                chat_history: this.chatHistory 
            });

            this.chatHistory.push(new HumanMessage(input));
            this.chatHistory.push(new AIMessage(result.output));

            returnValue = result.output;
        } catch (error) {
            console.error("Agent execution error:", error);
            throw error;
        } finally {
            try {
                if (this.dbClient.topology && this.dbClient.topology.isConnected()) {
                    await this.dbClient.close();
                }
            } catch (error) {
                console.error("Error closing DB connection:", error);
            }
        }
        return returnValue;
    }
}

module.exports = ContosoBikeStoreAgent;