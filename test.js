const apiKey = 'AIzaSyD4Tixcow6c6VDviL8SNIRlXmqLmZD7DAs';
async function testModel(modelName) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
    });
    const text = await r.text();
    console.log(`${modelName}: ${r.status}`, text.substring(0, 500));
  } catch (e) {
    console.error(modelName, e.message);
  }
}
async function run() {
  await testModel('gemini-2.5-flash');
  await testModel('gemini-flash-latest');
}
run();
