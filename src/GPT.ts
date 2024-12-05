import axios from "axios";

export class GPTSessionManager {

  private static sessionContext: string = ""; // Store session context
  private static conversationHistory: { role: string; content: string }[] = [];
  private static apiKey: string = ""; // OpenAI API key

  public static initialize(apiKey: string) {  // initialPrompt: string) {
      this.apiKey = apiKey;
      const initialPrompt = `You are a code completion tool. You must only produce code that completes the input code. 
        Your answers must not include the code given as context, as they will be used to directly complete the user's code. 
        Include a newline character at the end of the suggested code when needed.
        Example: input="for i in range", output="(1:10):\n", and not "for i in range(1:10):\n".`;
      // Add the initial system prompt
      this.conversationHistory.push({ role: "system", content: initialPrompt });
      this.sessionContext = initialPrompt;
  }

  
  public static async getLLMSuggestion(context: string, includeDocumentation: boolean = false): Promise<string> {
    if (this.apiKey == "") {
      return "Set an OpenAI API key within the settings!";
    }    
    let prompt = includeDocumentation
        ? `Provide a suggestion with documentation based on the context:\n ${context}`  // TODO probabilmente dovremmo cambiare il prompt al cambio del parametro
        : `Context:\n ${context}`;
    
    // Call the LLM API instead of the placeholder suggestion
    let suggestion = await this.getCompletion(prompt);
    console.log(suggestion);
    return suggestion;
  }


  // Get completions with minimal input
  private static async getCompletion(prompt: string): Promise<string> {
    const axios = require("axios");
    // Add the minimal user prompt to the history
    this.addToHistory("user", prompt);
    try {
      // Send the request to the OpenAI API
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
            model: "gpt-4o-mini",
            messages: this.conversationHistory,
            max_completion_tokens: 100,
            temperature: 0.7,
            n: 1  // number of choices
        },
        {
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
            },
        }
      );

      // Extract and return the assistant's reply
      let completion = response.data.choices[0].message.content;

      // Add the assistant's reply to the history
      this.addToHistory("assistant", completion);

      completion = this.stripCodeBlockFormatting(completion);
      return completion;
    } catch (error) {
      console.error('Error communicating with GPT model:', error);
      return '';
    }
  }

  // Add a message to the conversation history
  private static addToHistory(role: "user" | "assistant", content: string): void {
    this.conversationHistory.push({ role, content });
  }
  
  private static stripCodeBlockFormatting(code: string): string {
    // Use a regular expression to match the backticks and optional language
    const codeBlockRegex = /^```(\w+)?\n([\s\S]*?)```$/;
    // Apply the regex and extract the inner code
    const match = code.match(codeBlockRegex);
    if (match) {
      let clean_code = match[2];
      return clean_code; // Return the inner code
    }
    // If the input doesn't match the format, return it as is
    return code.trim();
  }

}

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
  //  enrichedSuggestion = await suggestion + `\n\n// Documentation references included.`;
  //}
  //return enrichedSuggestion;
