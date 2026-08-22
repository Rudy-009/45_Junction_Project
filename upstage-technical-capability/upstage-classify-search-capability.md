# Upstage AI - Classify & File Search Capability 상세 문서

> 최종 업데이트: 2026-08-22  
> 참조: Upstage Console Documentation, Upstage Blog, LangChain Integration Docs

---

## 1. 개요

### Classify (문서 분류)

**Upstage Classify**는 문서 인텔리전스(Document Intelligence) 파이프라인의 첫 번째 단계로, 수신된 문서의 유형을 자동으로 식별하고 분류하는 기능입니다. 사용자가 정의한 택소노미(taxonomy)를 기반으로 제로샷(zero-shot) 분류를 수행하며, 재학습 없이도 새로운 문서 유형을 즉시 추가할 수 있습니다.

Classify는 두 가지 주요 기능으로 구성됩니다:
- **Document Classification**: 문서의 유형을 분류 (예: 청구서, 영수증, 계약서 등)
- **Document Split**: 하나의 PDF에 포함된 여러 문서를 자동으로 분리

### File Search (파일 검색)

**Upstage File Search**는 업로드된 문서에서 관련 정보를 검색하고 검색 증강 생성(RAG: Retrieval-Augmented Generation)을 가능하게 하는 기능입니다. Upstage의 Solar Embedding 모델을 활용하여 문서를 벡터화하고, 시맨틱 검색(semantic search)을 통해 사용자 쿼리에 가장 관련 있는 문서 조각을 검색합니다. Groundedness Check와 결합하여 환각(hallucination)을 최소화한 신뢰도 높은 답변을 생성할 수 있습니다.

---

## 2. Document Classification (문서 분류)

### 기능 설명

Document Classification(문서 분류)은 문서의 시각적 레이아웃과 의미적 내용을 결합 분석하여, 사용자가 제공한 택소노미에서 가장 적합한 문서 유형을 선택합니다.

**핵심 특징:**
- **택소노미 기반 분류**: 사전 학습된 고정 카테고리가 아닌, 사용자가 정의한 카테고리 목록에서 분류
- **제로샷 확장**: 모델 재학습 없이 택소노미 설명 업데이트만으로 새로운 문서 유형 추가 가능
- **시맨틱 + 비전 분석**: 텍스트 의미와 문서의 레이아웃/시각적 패턴을 동시에 분석
- **5개에서 500개 이상의 카테고리**까지 확장 가능
- **92.1% 정확도** (영어 및 한국어 보험 문서 내부 평가 기준)

**지원 입력 형식:**
- 디지털 PDF 및 스캔 PDF
- JPEG, PNG, TIFF 이미지
- 다중 페이지 스캔
- 모바일 촬영 이미지
- 레거시 시스템 내보내기 파일

### API 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `model` | string | ✅ | 사용할 모델명 (예: `"document-classify"`) |
| `document` | file | ✅ | 분류할 문서 파일 (PDF, 이미지 등) |
| `categories` | array | ✅ | 분류 택소노미 - 각 항목에 `name`과 `description` 포함 |

**택소노미 정의 형식:**
```json
[
  { "name": "invoice", "description": "Commercial billing documents with amounts and vendor details." },
  { "name": "receipt", "description": "Transaction-level purchase receipts." },
  { "name": "tax_form", "description": "Government-issued tax reporting forms." },
  { "name": "contract", "description": "Documents outlining agreements or terms." },
  { "name": "bank_statement", "description": "Monthly or quarterly bank account summaries." }
]
```

**응답 형식:**
```json
{
  "classification": {
    "category": "invoice",
    "confidence": 0.95
  }
}
```

### 지원 문서 유형

Document Classify는 다양한 문서 유형을 지원합니다:

| 카테고리 | 예시 |
|---------|------|
| **금융 문서** | 청구서(invoice), 명세서(statement), 급여명세서(payslip), 세금 양식(tax form) |
| **보험/의료 문서** | EOB(급여 설명서), 보험 청구서, 회원 ID 카드, 요약서 |
| **비즈니스 문서** | 계약서(contract), 서신(letter), 통지서(notice) |
| **신분 문서** | 운전면허증, 여권, 회원증 |
| **거래 문서** | POS 영수증, 모바일 촬영 영수증 |
| **보고서/인증서** | 검사 보고서, 제조 인증서 |

> 💡 택소노미 기반이므로 위 목록에 제한되지 않으며, 설명만 추가하면 어떤 문서 유형이든 분류 가능합니다.

---

## 3. Document Split (문서 분할)

### 기능 설명

Document Split는 하나의 PDF 파일에 여러 개의 독립적인 문서가 포함되어 있을 때, 이를 자동으로 인식하고 분리하여 개별적으로 처리할 수 있게 하는 기능입니다.

**현재 상태:** Beta

**주요 사용 시나리오:**
- **보험**: 하나의 제출물에 여러 청구 양식이 포함된 경우
- **은행/회계**: 여러 계좌 명세서가 함께 스캔된 경우
- **법률**: 개별 처리가 필요한 번들 계약서

### 작동 방식

Document Split는 Upstage의 **Information Extract** 기능의 일부로 동작합니다. `doc_split` 파라미터를 활성화하면, 시스템이 PDF 내의 문서 경계를 자동으로 감지하고 각 문서를 독립적으로 처리합니다.

**처리 흐름:**
1. PDF 파일 업로드
2. `doc_split: True` 옵션 설정
3. 시스템이 문서 경계 자동 감지
4. 각 문서별로 독립적인 정보 추출 수행
5. 문서별 결과를 배열로 반환

**API 요청 예시:**
```python
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[...],
    response_format={...},
    extra_body={
        "doc_split": True   # 문서 분할 활성화
    }
)
```

**응답 예시 (간소화):**
```json
[
  { "bank_name": "First National Bank" },
  { "bank_name": "Global Trust Bank" },
  { "bank_name": "Metro Financial Bank" }
]
```

> ⚠️ 실제 API 응답은 `choices` 배열 아래에 결과가 반환되며, 각 문서의 결과는 `message.content`에 JSON 문자열로 포함됩니다.

**Document Split의 장점:**
- 수동 분할 작업 제거
- 분할 정확도 향상 (AI 기반 문서 경계 인식)
- 대규모 복합 문서 파일의 자동 처리 가능

---

## 4. File Search (파일 검색)

### 기능 설명

Upstage File Search는 업로드된 문서들로부터 사용자의 질문에 관련된 정보를 검색하는 RAG(Retrieval-Augmented Generation) 기능입니다. 문서를 자동으로 파싱, 청킹(chunking), 임베딩하여 벡터 데이터베이스에 저장한 뒤, 사용자 쿼리와 의미적으로 유사한 문서 조각을 검색합니다.

**핵심 구성 요소:**
- **Document Parse**: 문서를 LLM이 읽을 수 있는 형식(HTML/Markdown)으로 변환
- **Solar Embedding**: 문서와 쿼리를 벡터 공간에 매핑
- **Groundedness Check**: 검색 결과 기반 답변의 사실 정확성 검증

### API 파라미터

#### Solar Embedding API

File Search의 핵심인 임베딩 API는 두 가지 모델로 구성됩니다:

| 모델명 | 용도 | 설명 |
|--------|------|------|
| `solar-embedding-1-large-passage` | 문서 임베딩 | 검색 대상 문서/패시지를 벡터화 |
| `solar-embedding-1-large-query` | 쿼리 임베딩 | 사용자 검색 쿼리를 벡터화 |

**공통 파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `model` | string | ✅ | 임베딩 모델명 |
| `input` | string/array | ✅ | 임베딩할 텍스트 또는 텍스트 배열 |

**특징:**
- 영어, 한국어, 일본어 다국어 지원
- OpenAI text-embedding-3-large 대비 우수한 성능
- MTEB Retrieval 및 MIRACL 벤치마크에서 검증
- 통합 벡터 공간(unified vector space)에서 query와 passage 모델 운영

### 검색 방식

Upstage의 파일 검색은 다음과 같은 파이프라인으로 동작합니다:

```
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  문서 업로드  │ → │ Document Parse│ → │ Chunking & Embed │ → │ Vector Store  │
└─────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
                                                                       ↓
┌─────────────┐    ┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  답변 생성   │ ← │Groundedness  │ ← │  Solar LLM      │ ← │ 유사도 검색   │
│  (최종)      │    │Check (검증)   │    │  (답변 생성)     │    │ (Retrieval)  │
└─────────────┘    └──────────────┘    └─────────────────┘    └──────────────┘
```

1. **문서 인제스트**: Document Parse로 PDF/이미지 등을 구조화된 텍스트로 변환
2. **청킹 & 임베딩**: 텍스트를 적절한 크기로 분할 후 `solar-embedding-1-large-passage`로 벡터화
3. **벡터 저장**: 임베딩된 벡터를 벡터 데이터베이스에 저장
4. **쿼리 처리**: 사용자 쿼리를 `solar-embedding-1-large-query`로 벡터화
5. **유사도 검색**: 쿼리 벡터와 가장 유사한 문서 조각 검색
6. **답변 생성**: Solar LLM이 검색된 컨텍스트를 기반으로 답변 생성
7. **신뢰도 검증**: Groundedness Check로 답변의 사실 정확성 검증

---

## 5. API 사용 예시

### Document Classification - curl

```bash
curl -X POST "https://api.upstage.ai/v1/document-ai/document-classify" \
  -H "Authorization: Bearer $UPSTAGE_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "document=@/path/to/document.pdf" \
  -F 'categories=[{"name":"invoice","description":"Commercial billing documents with amounts and vendor details."},{"name":"receipt","description":"Transaction-level purchase receipts."},{"name":"contract","description":"Documents outlining agreements or terms."}]'
```

### Document Classification - Python

```python
import requests

API_KEY = "your_upstage_api_key"
url = "https://api.upstage.ai/v1/document-ai/document-classify"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

files = {
    "document": open("/path/to/document.pdf", "rb")
}

data = {
    "categories": '''[
        {"name": "invoice", "description": "Commercial billing documents with amounts and vendor details."},
        {"name": "receipt", "description": "Transaction-level purchase receipts."},
        {"name": "tax_form", "description": "Government-issued tax reporting forms."},
        {"name": "contract", "description": "Documents outlining agreements or terms."}
    ]'''
}

response = requests.post(url, headers=headers, files=files, data=data)
result = response.json()
print(f"분류 결과: {result['classification']['category']}")
print(f"신뢰도: {result['classification']['confidence']}")
```

### Document Split - Python (Information Extract와 결합)

```python
from openai import OpenAI

client = OpenAI(
    api_key="your_upstage_api_key",
    base_url="https://api.upstage.ai/v1/solar"
)

# 다중 문서가 포함된 PDF에서 정보 추출 + 문서 분할
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": "Extract the bank name and account number from each document."
        }
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "bank_info",
            "schema": {
                "type": "object",
                "properties": {
                    "bank_name": {"type": "string"},
                    "account_number": {"type": "string"}
                }
            }
        }
    },
    extra_body={
        "doc_split": True  # 문서 분할 활성화
    }
)

# 각 문서별 결과 출력
for choice in extraction_response.choices:
    print(choice.message.content)
```

### File Search (Embedding + RAG) - Python

```python
from openai import OpenAI

client = OpenAI(
    api_key="your_upstage_api_key",
    base_url="https://api.upstage.ai/v1/solar"
)

# 1. 문서 임베딩 (passage 모델 사용)
passage_embedding = client.embeddings.create(
    model="solar-embedding-1-large-passage",
    input="Upstage는 2022년에 설립된 AI 기업으로, 문서 인텔리전스와 LLM 솔루션을 제공합니다."
)
print(f"Passage 임베딩 차원: {len(passage_embedding.data[0].embedding)}")

# 2. 쿼리 임베딩 (query 모델 사용)
query_embedding = client.embeddings.create(
    model="solar-embedding-1-large-query",
    input="Upstage는 언제 설립되었나요?"
)
print(f"Query 임베딩 차원: {len(query_embedding.data[0].embedding)}")
```

### File Search (Embedding) - curl

```bash
# Passage 임베딩
curl -X POST "https://api.upstage.ai/v1/solar/embeddings" \
  -H "Authorization: Bearer $UPSTAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "solar-embedding-1-large-passage",
    "input": "이 문서는 보험 청구 관련 내용을 포함합니다."
  }'

# Query 임베딩
curl -X POST "https://api.upstage.ai/v1/solar/embeddings" \
  -H "Authorization: Bearer $UPSTAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "solar-embedding-1-large-query",
    "input": "보험 청구는 어떻게 하나요?"
  }'
```

### LangChain을 활용한 RAG 파이프라인

```python
from langchain_upstage import UpstageEmbeddings, ChatUpstage, UpstageGroundednessCheck
from langchain_community.vectorstores import FAISS
from langchain.chains import RetrievalQA

# 임베딩 모델 초기화
embeddings = UpstageEmbeddings(model="solar-embedding-1-large")

# 문서 벡터 저장소 생성
documents = ["문서 내용 1", "문서 내용 2", "문서 내용 3"]
vectorstore = FAISS.from_texts(documents, embedding=embeddings)

# 검색기 생성
retriever = vectorstore.as_retriever(search_kwargs={"k": 3})

# Solar LLM으로 RAG 체인 구성
llm = ChatUpstage(model="solar-pro")
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    retriever=retriever,
    return_source_documents=True
)

# 질문 및 답변
result = qa_chain.invoke({"query": "이 문서에서 주요 내용은 무엇인가요?"})
print(f"답변: {result['result']}")

# Groundedness Check로 답변 검증
groundedness_check = UpstageGroundednessCheck()
gc_result = groundedness_check.run({
    "context": result["source_documents"][0].page_content,
    "assistant_message": result["result"]
})
print(f"Groundedness: {gc_result}")
```

---

## 6. 사용 사례

### 보험 업계
| 기능 | 사용 사례 |
|------|----------|
| Document Classify | 수신 문서 자동 분류 (청구서, 보험증서, 의료기록 등) |
| Document Split | 하나의 제출물에 포함된 여러 청구 양식 분리 |
| File Search | 보험 약관에서 특정 조항 검색 및 Q&A |

### 금융 서비스
| 기능 | 사용 사례 |
|------|----------|
| Document Classify | 거래 문서 유형 식별 (명세서, 계약서, 세금 양식) |
| Document Split | 번들된 은행 명세서를 계좌별로 분리 |
| File Search | 금융 규제 문서 검색 및 컴플라이언스 확인 |

### 법률/계약 관리
| 기능 | 사용 사례 |
|------|----------|
| Document Classify | 계약 유형 분류 (NDA, 서비스 계약, 임대차 등) |
| Document Split | 번들된 법적 문서를 개별 계약으로 분리 |
| File Search | 계약 조항 검색 및 비교 분석 |

### 의료/헬스케어
| 기능 | 사용 사례 |
|------|----------|
| Document Classify | 의료 문서 유형 식별 (처방전, 진단서, 보험 청구서) |
| Document Split | 환자별 문서 분리 |
| File Search | 의료 가이드라인 검색 및 참조 |

### 제조업
| 기능 | 사용 사례 |
|------|----------|
| Document Classify | 품질 인증서, 검사 보고서, 납품 문서 분류 |
| Document Split | 복합 보고서에서 개별 항목 분리 |
| File Search | 제조 사양서 및 매뉴얼 검색 |

### 통합 워크플로우 예시

```
[문서 수신] → [Document Classify] → [Document Split] → [Information Extract] → [File Search/RAG]
     ↓              ↓                      ↓                    ↓                      ↓
  PDF 업로드    유형 식별            개별 문서 분리       핵심 데이터 추출      지식 기반 Q&A
                (보험? 계약?)     (3개 청구서 분리)    (금액, 날짜 등)     (관련 정보 검색)
```

---

## 7. 참조 링크

### 공식 문서
- [Upstage Console - Document Classification](https://console.upstage.ai/docs/capabilities/classify/document-classification)
- [Upstage Console - Document Split](https://console.upstage.ai/docs/capabilities/classify/document-split)
- [Upstage Console - File Search](https://console.upstage.ai/docs/capabilities/search/file-search)
- [Upstage Console - Getting Started](https://console.upstage.ai/docs/getting-started)
- [Upstage Console - Embeddings](https://console.upstage.ai/docs/capabilities/embeddings)
- [Upstage Console - Groundedness Check](https://console.upstage.ai/docs/capabilities/groundedness-checking)

### 블로그 & 제품 페이지
- [Document Classify 소개 블로그](https://upstage.ai/ko/blog/en/introducing-document-classify-universal-semantic-classification-for-any-document)
- [Document Split Beta 소개 블로그](https://upstage.ai/blog/en/information-extract-document-split-beta)
- [Solar Embedding-1-Large 소개](https://upstage.ai/blog/en/solar-embedding-1-large)
- [RAG & Groundedness Check](https://www.upstage.ai/blog/en/llm-rag-groundedness-check)
- [Document Parse 제품 페이지](https://www.upstage.ai/products/document-parse)
- [Information Extract 제품 페이지](https://www.upstage.ai/products/information-extract)
- [AI Space 제품 페이지](https://www.upstage.ai/products/ai-space)

### 개발자 리소스
- [Upstage Cookbook (GitHub)](https://github.com/UpstageAI/cookbook)
- [LangChain Upstage Integration](https://python.langchain.com/docs/integrations/providers/upstage/)
- [LangChain UpstageEmbeddings](https://python.langchain.com/docs/integrations/text_embedding/upstage/)
- [Upstage Playground](https://console.upstage.ai/playground)

### API 가격
- [Upstage API Pricing](https://www.upstage.ai/pricing/api)
- Document Parse: $0.01/page
- Solar Embedding 및 기타 API: [공식 가격표 참조](https://www.upstage.ai/pricing/api)

---

## 부록: 주요 용어 정리

| 용어 | 설명 |
|------|------|
| **택소노미(Taxonomy)** | 문서 분류를 위한 카테고리 체계. 이름과 설명으로 구성 |
| **제로샷(Zero-shot)** | 사전 학습 없이 새로운 분류 수행 |
| **RAG** | Retrieval-Augmented Generation. 검색 기반 답변 생성 |
| **임베딩(Embedding)** | 텍스트를 수치 벡터로 변환하는 과정 |
| **청킹(Chunking)** | 긴 문서를 검색에 적합한 크기로 분할 |
| **Groundedness Check** | LLM 답변이 제공된 문맥에 근거하는지 검증 |
| **Document Parse** | 문서를 HTML/Markdown 등 구조화된 형식으로 변환 |
| **Information Extract** | 문서에서 키-값 쌍의 구조화된 데이터 추출 |

---

> 📌 **참고사항**: Document Classify와 Document Split는 현재 **Beta** 상태이며, Beta 기간 동안 무료로 사용할 수 있습니다. 정식 출시 시 가격 정책이 변경될 수 있으므로 [공식 가격 페이지](https://www.upstage.ai/pricing/api)를 확인하세요.
