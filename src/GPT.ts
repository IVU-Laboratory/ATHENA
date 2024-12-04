import axios from 'axios';

let apiKey : String | undefined;  //TODO this should be probably set within the settings from the user

async function requestGPT4(prompt: string): Promise<string> {
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
            { role: 'system', content: 'You are a code completion tool. You must only produce code that completes the input code.' },
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
      code_suggestion = stripCodeBlockFormatting(code_suggestion);
      console.log("Obtained code suggestion: " + code_suggestion);
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


export async function getLLMSuggestion(context: string, includeDocumentation: boolean = false): Promise<string> {
  let prompt = "";
  prompt = includeDocumentation
      ? `Provide a suggestion with documentation based on the context: ${context}`
      : `Provide a suggestion based on the context: ${context}`;
  

  // Call the LLM API instead of the placeholder suggestion
  let suggestion = "placeholder suggestion"; // await requestGPT4(prompt);
  return suggestion;

  //let suggestion = new Promise<string>((resolve) => {
  //    setTimeout(() => {
  //      resolve(`// LLM suggestion based on granularity level ${suggestionGranularity}`); // TODO this is a placeholder for the LLM API call
  //    vscode.window.showInformationMessage;
  //    }, 1000);
  //  }
  //);
  // Maybe the documentation might be asked within the prompt, so that getLLMSuggestion would take "includeDocumentation" as an input parameter and change the LLM prompt accordingly
  //let enrichedSuggestion = suggestion;
  //if (includeDocumentation) {
  //  enrichedSuggestion = enrichSuggestionWithDocumentation(await suggestion);
  //}
  //return enrichedSuggestion;
}
/**/