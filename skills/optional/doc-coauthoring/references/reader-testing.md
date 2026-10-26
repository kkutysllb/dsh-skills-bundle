# Manual Reader Testing (when no sub-agents are available)

Use this procedure when the environment has no sub-agent tool, e.g. a plain chat interface.

The user will need to do the testing manually.

### Step 1: Predict Reader Questions

Ask what questions people might ask when trying to discover this document. What would they type into a search box or ask an assistant?

Generate 5-10 questions that readers would realistically ask.

### Step 2: Setup Testing

Provide testing instructions:
1. Open a fresh conversation with an AI assistant in a separate window (no context from this one)
2. Paste or share the document content (if using a shared doc platform with connectors enabled, provide the link)
3. Ask the reader instance the generated questions

For each question, instruct the reader instance to provide:
- The answer
- Whether anything was ambiguous or unclear
- What knowledge/context the doc assumes is already known

Check if the reader instance gives correct answers or misinterprets anything.

### Step 3: Additional Checks

Also ask the reader instance:
- "What in this doc might be ambiguous or unclear to readers?"
- "What knowledge or context does this doc assume readers already have?"
- "Are there any internal contradictions or inconsistencies?"

### Step 4: Iterate Based on Results

Ask what the reader instance got wrong or struggled with. Indicate intention to fix those gaps.

Loop back to refinement for any problematic sections.

---
