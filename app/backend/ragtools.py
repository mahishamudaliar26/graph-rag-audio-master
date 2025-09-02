import re
import os
from typing import Any
from azure.identity import DefaultAzureCredential
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import VectorizableTextQuery
from azure.search.documents.models import VectorizedQuery
from openai import AsyncAzureOpenAI 
from rtmt import RTMiddleTier, Tool, ToolResult, ToolResultDirection


_search_tool_schema = {
    "type": "function",
    "name": "search",
    "description": "Search the knowledge base. The knowledge base is in English, translate to and from English if " + \
                   "needed. Results are formatted as a source name first in square brackets, followed by the text " + \
                   "content, and a line with '-----' at the end of each result.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Search query"
            }
        },
        "required": ["query"],
        "additionalProperties": False
    }
}


_grounding_tool_schema = {
    "type": "function",
    "name": "report_grounding",
    "description": "Report use of a source from the knowledge base as part of an answer (effectively, cite the source). Sources " + \
                   "appear in square brackets before each knowledge base passage. Always use this tool to cite sources when responding " + \
                   "with information from the knowledge base.",
    "parameters": {
        "type": "object",
        "properties": {
            "sources": {
                "type": "array",
                "items": {
                    "type": "string"
                },
                "description": "List of source names from last statement actually used, do not include the ones not used to formulate a response"
            }
        },
        "required": ["sources"],
        "additionalProperties": False
    }
}


def create_openai_client() -> AsyncAzureOpenAI:
    return AsyncAzureOpenAI(
        azure_endpoint=os.environ.get("AZURE_OPENAI_ENDPOINT"),
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-02-15-preview"),
        api_key=os.environ.get("AZURE_OPENAI_API_KEY"),
    )


async def _search_tool(search_client: SearchClient, args: Any) -> ToolResult:
    print(f"Searching for '{args['query']}' in the knowledge base.")

    openai_client = create_openai_client()
    
    # FIX: Add await here
    embeddings_response = await openai_client.embeddings.create(
        input=args['query'],
        model=os.environ.get("AZURE_OPENAI_EMBEDDING_MODEL_NAME", "text-embedding-ada-002")
    )

    query_embedding = embeddings_response.data[0].embedding

    # FIX: Add await here
    search_results = await search_client.search(
        search_text=None,
        vector_queries=[
            VectorizedQuery(
                vector=query_embedding,
                k_nearest_neighbors=50,
                fields="content_vector",
            )
        ],
        query_type="semantic",
        top=5,
        select="chunk,title,content"
    )
    
    result = ""
    async for r in search_results:
        result += f"[{r['chunk']}]: {r['content']}\n-----\n"    
    return ToolResult(result, ToolResultDirection.TO_SERVER)


KEY_PATTERN = re.compile(r'^[a-zA-Z0-9_=\-]+$')

# TODO: move from sending all chunks used for grounding eagerly to only sending links to 
# the original content in storage, it'll be more efficient overall
async def _report_grounding_tool(search_client: SearchClient, args: Any) -> ToolResult:  # Fixed return type
    sources = [s for s in args["sources"] if KEY_PATTERN.match(s)]
    source_list = " OR ".join(sources)  # Renamed from 'list' to avoid builtin conflict
    print(f"Grounding source: {source_list}")
    
    # Since chunk is Int32, we need to convert sources to integers and use proper filtering
    try:
        # Convert sources to integers (assuming they are numeric chunk IDs)
        chunk_ids = [int(s) for s in sources if s.isdigit()]
        
        if not chunk_ids:
            return ToolResult({"sources": []}, ToolResultDirection.TO_CLIENT)
        
        # Build filter for integer chunk field
        if len(chunk_ids) == 1:
            filter_expr = f"chunk eq {chunk_ids[0]}"
        else:
            # For multiple values, use OR conditions
            filter_conditions = [f"chunk eq {chunk_id}" for chunk_id in chunk_ids]
            filter_expr = " or ".join(filter_conditions)
        
        search_results = await search_client.search(
            filter=filter_expr,
            select=["chunk", "title", "content"]  # Fixed: removed duplicate "chunk"
        )

        docs = []
        async for r in search_results:
            docs.append({
                "chunk": str(r['chunk']),  # Convert back to string for consistency
                "title": r["title"], 
                "content": r['content']
            })
        
        return ToolResult({"sources": docs}, ToolResultDirection.TO_CLIENT)
        
    except ValueError as e:
        print(f"Error converting chunk IDs to integers: {e}")
        return ToolResult({"sources": [], "error": "Invalid chunk IDs"}, ToolResultDirection.TO_CLIENT)
    except Exception as e:
        print(f"Error in grounding tool: {e}")
        return ToolResult({"sources": [], "error": str(e)}, ToolResultDirection.TO_CLIENT)


def attach_rag_tools(rtmt: RTMiddleTier, search_endpoint: str, search_index: str, credentials: AzureKeyCredential | DefaultAzureCredential) -> None:
    if not isinstance(credentials, AzureKeyCredential):
        credentials.get_token("https://search.azure.com/.default") # warm this up before we start getting requests
    search_client = SearchClient(search_endpoint, search_index, credentials, user_agent="RTMiddleTier")

    rtmt.tools["search"] = Tool(schema=_search_tool_schema, target=lambda args: _search_tool(search_client, args))
    rtmt.tools["report_grounding"] = Tool(schema=_grounding_tool_schema, target=lambda args: _report_grounding_tool(search_client, args))
