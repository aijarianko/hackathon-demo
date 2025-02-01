require('dotenv').config();
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const mammoth = require("mammoth");

async function main() {    
    var dbname = process.env.MONGODB_Name;
    var dbconn = process.env.MONGODB_CONNECTION_STRING;
    
    const client = new MongoClient(dbconn);

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(dbname);
        // Load product data
        console.log("Loading product data");
        // Initialize the product collection pointer (will automatically be created if it doesn't exist)
        const productCollection = db.collection("products");

        // Define the path to the local JSON file
        const jsonFilePath = path.join("data", "product.json");

        // Read the JSON file
        const productRawData = fs.readFileSync(
        path.join("data", "product.json"),
        "utf8"
        );
        const productData = JSON.parse(productRawData).map((prod) =>
        cleanData(prod)
        );

        // Delete any existing products
        console.log("Deleting existing products");
        await productCollection.deleteMany({});

        var result = await productCollection.bulkWrite(
        productData.map((product) => ({
            insertOne: {
            document: product,
            },
        }))
        );
        console.log(`${result.insertedCount} products inserted`);

        // Load customer and sales data
        console.log("Retrieving combined Customer/Sales data");
        const customerCollection = db.collection("customers");
        const salesCollection = db.collection("sales");

        const custSalesRawData = fs.readFileSync(
        path.join("data", "custSalesData.json"),
        "utf8"
        );
        const custSalesData = JSON.parse(custSalesRawData).map((custSales) =>
        cleanData(custSales)
        );

        console.log("Split customer and sales data");
        const customerData = custSalesData.filter(
        (cust) => cust["type"] === "customer"
        );
        const salesData = custSalesData.filter(
        (sales) => sales["type"] === "salesOrder"
        );

        console.log("Loading customer data");
        await customerCollection.deleteMany({});
        result = await customerCollection.insertMany(customerData);
        console.log(`${result.insertedCount} customers inserted`);

        console.log("Loading sales data");
        await salesCollection.deleteMany({});
        result = await salesCollection.insertMany(salesData);
        console.log(`${result.insertedCount} sales inserted`);



        // Hackathon code
        console.log("Retrieving store data");
        const storeCollection = db.collection("store");
        
        const storeRawData = fs.readFileSync(
        path.join("data", "store.json"),
        "utf8"
        );
        const storeData = JSON.parse(storeRawData);

        console.log("Loading store data");
        await storeCollection.deleteMany({});
        result = await storeCollection.insertMany(storeData);
        console.log(`${result.insertedCount} stores inserted`);


        // Load onboarding.docx
        console.log("Loading onboarding.docx");
        const onboardingDocPath = path.join("data", "onboarding.docx");
        const onboardingDocContent = await mammoth.extractRawText({ path: onboardingDocPath });
        const onboardingCollection = db.collection("documents");
        await onboardingCollection.deleteMany({});

        await onboardingCollection.insertOne({
            name: "onboarding",
            content: onboardingDocContent.value,
        });
        console.log("onboarding.docx inserted");

        // Load leave_policy_document.docx
        console.log("Loading leave_policy_document.docx");
        const leavePolicyDocPath = path.join("data", "leave_policy_document.docx");
        const leavePolicyDocContent = await mammoth.extractRawText({ path: leavePolicyDocPath });
        await onboardingCollection.insertOne({
            name: "leavePolicy",
            content: leavePolicyDocContent.value,
        });
        console.log("leave_policy_document.docx inserted");

        // Load dos_and_donts.docx
        console.log("Loading dos_and_donts.docx");
        const dos_and_dontsPath = path.join("data", "dos_and_donts.docx");
        const dos_and_dontsDocContent = await mammoth.extractRawText({ path: dos_and_dontsPath });
        await onboardingCollection.insertOne({
            name: "dos_and_donts",
            content: dos_and_dontsDocContent.value,
        });
        console.log("dos_and_donts.docx inserted");

        
    } catch (err) {
        console.error(err);
    } finally {
        await client.close();
        console.log('Disconnected from MongoDB');
    }
}

function cleanData(obj) {
    cleaned =  Object.fromEntries(
        Object.entries(obj).filter(([key, _]) => !key.startsWith('_'))
    );
    //rename id field to _id
    cleaned["_id"] = cleaned["id"];
    delete cleaned["id"];
    return cleaned;
}

main().catch(console.error);