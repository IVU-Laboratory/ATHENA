# api.py
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer
#import torch

with open("accesstokenhf.txt", "r") as f:
    api_key = f.read().strip()

app = FastAPI()

# Load the StarCoder model and tokenizer
model_name = "bigcode/starcoder"
tokenizer = AutoTokenizer.from_pretrained(model_name, token=api_key)
model = AutoModelForCausalLM.from_pretrained(model_name, token=api_key)
print("Model loaded!")

class PromptRequest(BaseModel):
    prompt: str
    max_length: int = 50

@app.post("/")
async def generate_text(request: PromptRequest):
    # Tokenize the prompt
    inputs = tokenizer(request.prompt, return_tensors="pt")

    # Generate text
    outputs = model.generate(inputs.input_ids, max_length=request.max_length)

    # Decode the generated text
    generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return {"generated_text": generated_text}

