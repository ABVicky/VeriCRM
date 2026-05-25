import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const DEFAULT_FOLLOWUP_TEMPLATE = {
  id: "template_2",
  name: "12hr Cancel Followup",
  language: "English",
  message: "Hello {{customer_name}},\n\nThis is a quick follow-up regarding your order #{{order_number}} at {{store_name}}.\n\nWe haven't received verification for your shipping details yet. Please verify your order by replying CONFIRM. If not confirmed within 12 hours, your order will be cancelled. Thank you! 🙏",
};

async function main() {
  const { adminDb } = await import("../lib/firebase-admin");

  console.log("Fetching clients from Firestore...");
  const snap = await adminDb.collection("clients").get();
  
  for (const doc of snap.docs) {
    const data = doc.data();
    console.log(`\nClient ID: ${doc.id}`);
    console.log(`Name: ${data.name}`);
    
    let templates = data.whatsappTemplates || [];
    const hasFollowup = templates.some((t: any) => t.id === "template_2" || t.name === "12hr Cancel Followup");
    
    if (!hasFollowup) {
      console.log("Adding 12-Hour Followup template...");
      templates.push(DEFAULT_FOLLOWUP_TEMPLATE);
      await doc.ref.update({ whatsappTemplates: templates });
      console.log("Updated successfully!");
    } else {
      console.log("Followup template already exists.");
    }
  }
}

main();
