import axios from 'axios';

let apiKey : String | undefined;  //TODO this should be probably set within the settings from the user

export async function requestGPT4(prompt: string): Promise<string> {
  if (apiKey === undefined) {
    apiKey = process.env.OPENAI_API_KEY;
    if (apiKey === undefined) {
      console.log("API key is missing. Set it in the .env file.")  
      return "API key missing";
    }
  }
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a code completion tool. You must only produce code that completes the input code. ' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 100,
          temperature: 0.7,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
        }
      );
      let code_suggestion = response.data.choices[0].message.content;
      console.log(code_suggestion);
      code_suggestion = stripCodeBlockFormatting(code_suggestion);
      console.log(code_suggestion);
      return code_suggestion;
    } catch (error) {
      console.error('Error communicating with GPT-4:', error);
      return '';
    }
  }


function stripCodeBlockFormatting(code: string): string {
  // Use a regular expression to match the backticks and optional language
  const codeBlockRegex = /^```(\w+)?\n([\s\S]*?)```$/;

  // Apply the regex and extract the inner code
  const match = code.match(codeBlockRegex);
  if (match) {
    return match[2].trim(); // Return the inner code, trimmed of leading/trailing whitespace
  }

  // If the input doesn't match the format, return it as is
  return code.trim();
}