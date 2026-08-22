# Upstage Information Extract (Universal Extraction) 상세 문서

> 최종 업데이트: 2026-08-22  
> 이 문서는 Upstage AI의 Information Extract API (Universal Extraction) 기능을 종합적으로 정리한 기술 문서입니다.

---

## 목차

1. [개요](#1-개요)
2. [Universal Extraction 핵심 기능](#2-universal-extraction-핵심-기능)
3. [API 파라미터 및 엔드포인트](#3-api-파라미터-및-엔드포인트)
4. [Schema 작성 방법](#4-schema-작성-방법)
5. [Location Coordinates (위치 좌표)](#5-location-coordinates-위치-좌표)
6. [Document Split (문서 분할)](#6-document-split-문서-분할)
7. [Confidence Score (신뢰도 점수)](#7-confidence-score-신뢰도-점수)
8. [Async API (비동기 처리)](#8-async-api-비동기-처리)
9. [사용 예시](#9-사용-예시)
10. [사용 사례](#10-사용-사례)
11. [참조 링크](#11-참조-링크)

---

## 1. 개요

### Information Extract란?

**Upstage Information Extract**는 비정형 문서(PDF, 스캔 이미지, Office 파일 등)에서 사용자가 정의한 스키마에 따라 구조화된 JSON 데이터를 추출하는 문서 인텔리전스 API입니다.

핵심 특징:
- **Zero-training (학습 불필요)**: 템플릿, 파인튜닝, 프롬프트 튜닝 없이 즉시 동작
- **Schema 기반 출력**: 사용자가 정의한 JSON Schema에 맞춰 타입, 중첩 구조, 필수 필드를 포함한 구조화 데이터 반환
- **레이아웃 이해**: 테이블, 체크박스, 다중 페이지 레이아웃, 회전된 콘텐츠 정확 처리
- **페이지당 정액 과금**: 토큰 수나 콘텐츠 복잡도와 무관하게 예측 가능한 과금

### Document Parse와의 차이점

| 구분 | Document Parse | Information Extract |
|------|---------------|-------------------|
| **목적** | 비정형 문서를 AI가 읽을 수 있는 형식으로 디지털화 | 문서에서 구조화된 데이터 필드를 추출 |
| **핵심 역할** | 스캔/복잡한 레이아웃을 깔끔한 텍스트 계층(HTML/Markdown)으로 변환 | 필요한 필드만 JSON으로 식별 및 추출 (스키마 정렬 + 좌표) |
| **출력 형식** | HTML/Markdown (문서 전체) | JSON (필드 + 값) |
| **성능** | 3.79초/페이지, 구조 정확도 94.48% | ~7.5초/페이지, 추출 정확도 78.32%+† |
| **사용 사례** | 검색, Q&A, RAG | ERP 자동화, 워크플로우 |
| **의존성** | 독립적 | 독립적 (Document Parse 불필요, 자체 OCR 내장) |

> † KIEval-4.0 (ICDAR 2025) 벤치마크 기준. 동일 데이터셋에서 GPT-4.1은 73.65 exact-match 정확도, 15.48초 레이턴시를 기록.

**요약:**
- "이 계약서에서 계약 금액을 추출해줘" → **Information Extract** (정보 추출)
- "이 계약서의 위약금 조항을 설명해줘" → **Document Parse** (문서 이해)

두 제품은 같은 워크플로우 내에서 함께 사용할 수 있지만, 서로 독립적으로 동작하며 상호 의존하지 않습니다.

---

## 2. Universal Extraction 핵심 기능

### 2.1 컨텍스트 및 의도 이해

단순히 명시적으로 작성된 텍스트뿐만 아니라, **암묵적으로 내포된 정보**도 추출합니다:
- 라인 아이템에서 합계 계산
- 라벨이 없는 세부사항에서 의도 파악
- 테이블에서 "7,344"가 단순 숫자가 아닌 "특정 청구건의 총 손실액"임을 인식

### 2.2 스키마 무관(Schema-agnostic) 적응

어떤 스키마든 동적으로 처리하고, 해당 스키마에 맞춘 구조화 출력을 생성합니다. 온디맨드 커스터마이징이 가능합니다.

### 2.3 모든 문서 타입 지원

| 항목 | 사양 |
|------|------|
| **지원 파일 형식** | JPEG, PNG, BMP, PDF, TIFF, HEIC, DOCX, PPTX, XLSX |
| **최대 파일 크기** | 50MB |
| **최대 페이지 수** | 동기: 100페이지 / 비동기: 1,000페이지 |
| **최대 픽셀 수** | 200,000,000 픽셀 |
| **OCR 지원 문자** | 영숫자, 한글, 일본어·한자(Beta) |

### 2.4 주요 기능 목록

- **키-값(Key-Value) 추출**
- **테이블 → 구조화 JSON 변환**
- **중첩·계층적 데이터 추출**
- **다중 문서 일관성 처리**
- **필드 단위 위치 추적 (Location Coordinates)**
- **신뢰도 점수 (Confidence Scoring)**
- **자동 스키마 생성 (Automatic Schema Generation)**
- **문서 분할 (Document Split)**

### 2.5 추출 모드

| 모드 | 설명 |
|------|------|
| `standard` | 기본 모드, 빠른 추출 |
| `enhanced` | 복잡한 테이블/이미지에서 정확도 향상 (다소 느림) |

### 2.6 사전 구축 모델 (Prebuilt Models)

스키마 정의 없이 바로 사용 가능한 모델:

| 모델명 | 문서 타입 |
|--------|-----------|
| `receipt-extraction` | 영수증 |
| `air-waybill-extraction` | 항공 화물운송장 |
| `bill-of-lading-and-shipping-request-extraction` | 선하증권 / 선적 요청서 |
| `commercial-invoice-and-packing-list-extraction` | 상업 송장 / 포장 명세서 |
| `kr-export-declaration-certificate-extraction` | 한국 수출신고필증 |

---

## 3. API 파라미터 및 엔드포인트

### 3.1 엔드포인트

| 모드 | 엔드포인트 |
|------|-----------|
| **동기 추출** | `POST https://api.upstage.ai/v1/information-extraction` |
| **비동기 추출** | `POST https://api.upstage.ai/v1/information-extraction/async` |
| **작업 상태 확인** | `GET https://api.upstage.ai/v1/information-extraction/jobs/{job_id}` |
| **스키마 자동 생성** | `POST https://api.upstage.ai/v1/information-extraction/schema-generation` |

> **OpenAI SDK 호환**: `base_url`을 `https://api.upstage.ai/v1/information-extraction`으로 설정하면 OpenAI Python SDK로 바로 사용 가능

### 3.2 요청 파라미터

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| `model` | string | ✅ | `information-extract` 또는 `information-extract-nightly` |
| `messages` | array | ✅ | `image_url` 타입의 단일 user 메시지 |
| `response_format` | object | ✅ | 추출 스키마 (JSON Schema 형식) |
| `mode` | string | ❌ | `standard` (기본값) 또는 `enhanced` |
| `location` | boolean | ❌ | 좌표 반환 여부 (기본값: false) |
| `confidence` | boolean | ❌ | 신뢰도 점수 반환 여부 (기본값: false) |
| `split` | boolean | ❌ | 다중 문서 분할 여부 (기본값: false) |

> Python SDK 사용 시 `location`, `confidence`, `split` 등 추가 파라미터는 `extra_body` 딕셔너리로 전달합니다.

### 3.3 제한 사항

| 항목 | 동기 (Sync) | 비동기 (Async) |
|------|-------------|----------------|
| 최대 페이지 수 | 100 | 1,000 |
| 최대 프로퍼티 수 | 100 | 5,000 |
| 최대 스키마 문자 수 | 15,000 | 120,000 |

### 3.4 응답 구조

```json
{
  "choices": [
    {
      "message": {
        "content": "{\"invoice_number\": \"INV-001\", \"total_amount\": \"$1,234.56\", \"date\": \"2026-01-15\"}"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 500,
    "completion_tokens": 50
  }
}
```

> `content`는 JSON 문자열이므로 `json.loads()`로 파싱해야 합니다.

---

## 4. Schema 작성 방법

### 4.1 개요

Information Extract는 **JSON Schema 형식**으로 추출할 필드를 정의합니다. 스키마를 정의하면 어떤 문서에서든 해당 필드를 추출합니다.

### 4.2 지원 데이터 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| `string` | 문자열 | `"hello"` |
| `number` | 부동소수점 포함 숫자 | `1.3`, `3.141` |
| `integer` | 정수 | `42`, `-5` |
| `boolean` | 참/거짓 | `true`, `false` |
| `array` | 배열 | `["a", "b", "c"]` |
| `object` | 키-값 조합 | `{"key": "value"}` |

### 4.3 스키마 규칙

- 최상위 `properties`에는 `string`, `integer`, `number`, `array`만 허용 (object 불가)
- 중첩 배열(array of arrays) 불가
- 모든 프로퍼티명의 총 문자 길이는 10,000자 미만
- `description` 필드로 추출 의도를 명확히 설명하면 정확도 향상

### 4.4 Manual Schema Design (수동 스키마 작성)

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "document_schema",
    "schema": {
      "type": "object",
      "properties": {
        "bank_name": {
          "type": "string",
          "description": "은행 명세서에 표시된 은행 이름"
        },
        "transactions": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "transaction_date": {
                "type": "string",
                "description": "각 거래가 발생한 날짜"
              },
              "transaction_description": {
                "type": "string",
                "description": "각 거래에 대한 설명"
              },
              "amount": {
                "type": "number",
                "description": "거래 금액"
              }
            },
            "required": ["transaction_date", "transaction_description"]
          }
        }
      },
      "required": ["bank_name", "transactions"]
    }
  }
}
```

### 4.5 Automatic Schema Generation (자동 스키마 생성)

최대 3개의 문서에서 초기 스키마를 자동 생성합니다. 별도의 엔드포인트를 사용합니다.

```python
from openai import OpenAI

schema_client = OpenAI(
    api_key="UPSTAGE_API_KEY",
    base_url="https://api.upstage.ai/v1/information-extraction/schema-generation"
)

schema_response = schema_client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_data}"}
                }
            ]
        }
    ],
)

import json
schema = json.loads(schema_response.choices[0].message.content)
# 이 schema를 response_format으로 사용하여 추출 수행
```

**권장 워크플로우:**
1. Automatic Schema Generation으로 초기 스키마 생성
2. 필요에 따라 Manual Schema Design으로 미세 조정
3. 조정된 스키마로 대량 문서 추출

### 4.6 스키마 작성 팁

- **description을 상세히 작성**: 필드의 의미와 기대하는 형식을 명확히 기술
- **required 배열 활용**: 반드시 추출해야 하는 필수 필드 지정
- **array + items**: 반복 데이터(거래 내역, 라인 아이템)에는 배열 사용
- **적절한 타입 지정**: 금액은 `number`, 날짜는 `string` (형식 지정 가능)

---

## 5. Location Coordinates (위치 좌표)

### 5.1 개요

**Location Coordinates (Beta)** 기능은 추출된 각 값이 원본 문서에서 정확히 어디에 위치하는지 페이지 번호와 좌표를 함께 반환합니다.

### 5.2 필요성

- 단순 값 추출만으로는 부족한 워크플로우가 존재
- 감사관, 컴플라이언스 담당자, 법무팀은 값이 문서의 **어디에서** 발견되었는지 확인 필요
- 고규제 산업에서 필수적이며, 사용자 신뢰도 향상

### 5.3 활용 시나리오

- **계약서 검토**: 조항을 하이라이트하여 법무팀이 빠르게 검증
- **컴플라이언스**: 추출 데이터와 출처 위치를 함께 보관하여 감사 추적
- **재무 보고**: 은행 명세서/대차대조표의 수치를 정확한 페이지와 라인 아이템으로 추적

### 5.4 사용 방법

```python
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[...],                   # 문서 입력
    response_format={...},            # 추출 스키마
    extra_body={"location": True}     # 페이지 좌표 반환 활성화
)
```

### 5.5 응답 형식

```json
{
  "bank_name": {
    "value": "Bank of Dream",
    "page": 1,
    "coordinates": [
      {"x": 0.07, "y": 0.148},
      {"x": 0.2074, "y": 0.148},
      {"x": 0.2074, "y": 0.1606},
      {"x": 0.07, "y": 0.1606}
    ]
  }
}
```

좌표는 정규화된 값(0~1)으로, 문서 페이지의 상대적 위치를 나타내는 4개의 꼭짓점(바운딩 박스)입니다.

---

## 6. Document Split (문서 분할)

### 6.1 개요

**Document Split (Beta)** 기능은 하나의 PDF에 여러 문서가 포함된 경우 자동으로 분리하여 각각 독립적으로 처리합니다.

### 6.2 활용 시나리오

- **보험**: 하나의 제출물에 여러 청구 양식이 포함된 경우
- **은행/회계**: 여러 계좌 명세서가 함께 스캔된 경우
- **법률**: 개별 처리가 필요한 묶음 계약서

### 6.3 사용 방법

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

### 6.4 응답 형식 (간소화)

```json
[
  { "bank_name": "First National Bank" },
  { "bank_name": "Global Trust Bank" },
  { "bank_name": "Metro Financial Bank" }
]
```

> **참고**: 실제 API 응답은 `choices` 배열 아래에 결과가 반환되며, 각 문서의 결과는 `message.content`에 JSON 문자열로 포함됩니다.

### 6.5 장점

- 수동 분할 작업 제거
- 정확도 향상
- 복잡한 다중 문서 파일의 대규모 처리 용이

---

## 7. Confidence Score (신뢰도 점수)

### 7.1 개요

**Confidence Score** 기능은 추출된 각 필드에 대해 0~1 사이의 신뢰도 점수를 반환합니다. 이를 통해 자동화와 수동 검토를 구분하는 **Human-in-the-Loop** 워크플로우를 구현할 수 있습니다.

### 7.2 활용 방법

```python
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[...],
    response_format={...},
    extra_body={"confidence": True}   # 신뢰도 점수 반환 활성화
)
```

### 7.3 워크플로우 설계

- **고신뢰도 출력**: 자동으로 다운스트림 시스템에 전달 (중단 없이 처리)
- **저신뢰도 출력**: 검토 큐로 라우팅하여 사람이 확인

### 7.4 Upstage Studio 연동

Upstage Studio에서는 parse, extract, classify 단계별로 신뢰도 점수를 할당합니다:
- 단일 pass/fail이 아닌 **단계별(per-step) 신뢰도 점수** 제공
- 고신뢰도 출력은 중단 없이 처리
- 저신뢰도 출력은 검토 큐로 플래그

---

## 8. Async API (비동기 처리)

### 8.1 개요

대용량 문서(최대 1,000페이지)를 처리할 때는 비동기 API를 사용합니다. 작업을 제출하고 폴링으로 결과를 확인하는 방식입니다.

### 8.2 비동기 vs 동기 비교

| 항목 | 동기 (Sync) | 비동기 (Async) |
|------|-------------|----------------|
| 최대 페이지 | 100 | 1,000 |
| 최대 프로퍼티 | 100 | 5,000 |
| 최대 스키마 문자 | 15,000 | 120,000 |
| 응답 방식 | 즉시 반환 | 작업 ID → 폴링 |

### 8.3 엔드포인트

- **작업 제출**: `POST https://api.upstage.ai/v1/information-extraction/async`
- **상태 확인**: `GET https://api.upstage.ai/v1/information-extraction/jobs/{job_id}`

### 8.4 워크플로우

1. **작업 제출** → 작업 ID 수신
2. **상태 폴링** → `status`가 `completed`가 될 때까지 반복 확인
3. **결과 수신** → 완료된 작업에서 추출 결과 획득

### 8.5 사용 예시

```python
import os
import time
import requests

api_key = os.environ["UPSTAGE_API_KEY"]
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

# 1. 비동기 작업 제출
response = requests.post(
    "https://api.upstage.ai/v1/information-extraction/async",
    headers=headers,
    json={
        "model": "information-extract",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": "FILE_URL_OR_BASE64"}
                    }
                ]
            }
        ],
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "document_schema",
                "schema": {
                    "type": "object",
                    "properties": {
                        "field1": {"type": "string", "description": "..."}
                    }
                }
            }
        }
    }
)
job_id = response.json()["id"]
print(f"작업 ID: {job_id}")

# 2. 결과 폴링
while True:
    status = requests.get(
        f"https://api.upstage.ai/v1/information-extraction/jobs/{job_id}",
        headers=headers
    ).json()
    
    if status["status"] == "completed":
        import json
        result = json.loads(status["choices"][0]["message"]["content"])
        print("추출 결과:", json.dumps(result, ensure_ascii=False, indent=2))
        break
    elif status["status"] == "failed":
        print("작업 실패:", status)
        break
    
    print("처리 중... 5초 후 재확인")
    time.sleep(5)
```

---

## 9. 사용 예시

### 9.1 curl 예시

```bash
curl -X POST "https://api.upstage.ai/v1/information-extraction" \
  -H "Authorization: Bearer $UPSTAGE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "information-extract",
    "messages": [
      {
        "role": "user",
        "content": [
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/document.pdf"
            }
          }
        ]
      }
    ],
    "response_format": {
      "type": "json_schema",
      "json_schema": {
        "name": "invoice_schema",
        "schema": {
          "type": "object",
          "properties": {
            "invoice_number": {
              "type": "string",
              "description": "송장 번호"
            },
            "total_amount": {
              "type": "string",
              "description": "통화 포함 총 금액"
            },
            "date": {
              "type": "string",
              "description": "송장 날짜 (YYYY-MM-DD 형식)"
            }
          },
          "required": ["invoice_number", "total_amount", "date"]
        }
      }
    }
  }'
```

### 9.2 Python 기본 예시 (OpenAI SDK)

```python
import os
import base64
import json
from openai import OpenAI

# 클라이언트 설정
client = OpenAI(
    api_key=os.environ["UPSTAGE_API_KEY"],
    base_url="https://api.upstage.ai/v1/information-extraction"
)

# 이미지를 base64로 인코딩
def encode_img_to_base64(img_path):
    with open(img_path, 'rb') as img_file:
        return base64.b64encode(img_file.read()).decode('utf-8')

img_path = "bank_statement.png"
base64_data = encode_img_to_base64(img_path)

# 추출 요청
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_data}"}
                }
            ]
        }
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "document_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "bank_name": {
                        "type": "string",
                        "description": "은행 명세서에 표시된 은행 이름"
                    },
                    "account_number": {
                        "type": "string",
                        "description": "계좌 번호"
                    },
                    "balance": {
                        "type": "number",
                        "description": "잔액"
                    }
                },
                "required": ["bank_name"]
            }
        }
    }
)

# 결과 파싱
result = json.loads(extraction_response.choices[0].message.content)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

출력 예시:
```json
{
  "bank_name": "Bank of Dream",
  "account_number": "1234-5678-9012",
  "balance": 15000000
}
```

### 9.3 Python - Location Coordinates + Confidence 동시 활성화

```python
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_data}"}
                }
            ]
        }
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "document_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "contract_amount": {
                        "type": "string",
                        "description": "계약 금액"
                    },
                    "effective_date": {
                        "type": "string",
                        "description": "계약 발효일"
                    }
                }
            }
        }
    },
    extra_body={
        "location": True,      # 위치 좌표 반환
        "confidence": True     # 신뢰도 점수 반환
    }
)
```

### 9.4 Python - Document Split (다중 문서 처리)

```python
extraction_response = client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:application/pdf;base64,{pdf_base64}"}
                }
            ]
        }
    ],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "claim_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "claimant_name": {
                        "type": "string",
                        "description": "청구인 이름"
                    },
                    "claim_amount": {
                        "type": "number",
                        "description": "청구 금액"
                    }
                }
            }
        }
    },
    extra_body={
        "doc_split": True   # 다중 문서 자동 분할
    }
)
```

### 9.5 Python - Prebuilt 모델 사용 (영수증)

```python
client = OpenAI(
    api_key=os.environ["UPSTAGE_API_KEY"],
    base_url="https://api.upstage.ai/v1/information-extraction"
)

response = client.chat.completions.create(
    model="receipt-extraction",  # 사전 구축 모델 사용
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": "https://example.com/receipt.jpg"}
                }
            ]
        }
    ]
    # response_format 불필요 (prebuilt 모델은 스키마 내장)
)
print(response.choices[0].message.content)
```

### 9.6 Python - 스키마 자동 생성 후 추출

```python
import json
from openai import OpenAI

# 1단계: 스키마 자동 생성
schema_client = OpenAI(
    api_key=os.environ["UPSTAGE_API_KEY"],
    base_url="https://api.upstage.ai/v1/information-extraction/schema-generation"
)

schema_response = schema_client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_data}"}
                }
            ]
        }
    ]
)

# 생성된 스키마 파싱
generated_schema = json.loads(schema_response.choices[0].message.content)
print("생성된 스키마:", json.dumps(generated_schema, ensure_ascii=False, indent=2))

# 2단계: 생성된 스키마로 추출 수행
extraction_client = OpenAI(
    api_key=os.environ["UPSTAGE_API_KEY"],
    base_url="https://api.upstage.ai/v1/information-extraction"
)

extraction_response = extraction_client.chat.completions.create(
    model="information-extract",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{base64_data}"}
                }
            ]
        }
    ],
    response_format=generated_schema
)

result = json.loads(extraction_response.choices[0].message.content)
print(json.dumps(result, ensure_ascii=False, indent=2))
```

---

## 10. 사용 사례

### 10.1 보험 업계

- **ACORD 양식 처리**: 청구 세부사항, 보장 유형별 손실 금액, 보험 기간 자동 추출
- **손해사정서(Loss Run) 분석**: 다중 페이지 Loss Run에서 구조화 데이터 추출
- **인수 심사(Underwriting)**: 30페이지 이상의 제출 서류에서 차량 정보, 보장 내역, 유효일자 자동 확인
- **청구 데이터 CRM 자동 입력**: 일 500건 이상의 청구를 자동으로 CRM에 입력

### 10.2 금융 서비스

- **은행 명세서 분석**: 거래 내역, 잔액, 계좌 정보 구조화
- **재무제표 데이터 추출**: 대차대조표, 손익계산서에서 핵심 수치 추출
- **대출 신청서 처리**: 신청인 정보, 소득, 부채 정보 자동 추출

### 10.3 헬스케어

- **의료 기록 처리**: 환자 정보, 진단 코드, 처방전 데이터 추출
- **보험 청구**: 의료 청구 양식에서 시술 코드, 금액 자동 추출

### 10.4 제조업

- **송장/인보이스 처리**: 품목, 수량, 단가, 총액 자동 추출
- **품질 검사 보고서**: 검사 항목, 결과, 불량률 데이터 구조화
- **공급망 문서**: 선하증권, 포장 명세서 자동 처리

### 10.5 법률

- **계약서 핵심 조항 추출**: 계약 금액, 발효일, 만료일, 당사자 정보
- **규제 문서 분석**: 규정 번호, 시행일, 적용 대상 자동 식별
- **묶음 계약서 분할 처리**: Document Split으로 개별 계약 분리 후 각각 추출

### 10.6 물류

- **항공 화물운송장 처리**: Prebuilt 모델로 즉시 데이터 추출
- **상업 송장 자동화**: 다양한 운송사(FedEx, UPS, DHL) 형식 통합 처리
- **수출 신고 문서**: 한국 수출신고필증 전용 모델 활용

---

## 11. 참조 링크

### 공식 문서

| 자료 | URL |
|------|-----|
| Information Extract 개요 | https://console.upstage.ai/docs/capabilities/extract |
| Universal Extraction | https://console.upstage.ai/docs/capabilities/extract/universal-extraction |
| Schema 작성법 | https://console.upstage.ai/docs/capabilities/extract/writing-a-schema |
| Location Coordinates | https://console.upstage.ai/docs/capabilities/extract/location-coordinates |
| Document Split | https://console.upstage.ai/docs/capabilities/extract/document-split |
| Confidence Score | https://console.upstage.ai/docs/capabilities/extract/confidence |
| Async API | https://console.upstage.ai/docs/capabilities/extract/universal-extraction-async |
| Getting Started | https://console.upstage.ai/docs/getting-started |

### 블로그 및 튜토리얼

| 자료 | URL |
|------|-----|
| Information Extract API 출시 발표 | https://www.upstage.ai/blog/en/extract-structured-data-from-any-document--information-extract-api-is-live |
| Document Parse vs Information Extract | https://www.upstage.ai/blog/en/difference-of-ie-and-dp |
| 3단계로 배우는 Information Extract | https://www.upstage.ai/blog/en/blog-information-extract-insurance-acord-loss-run |
| Location Coordinates Beta 발표 | https://www.upstage.ai/blog/en/information-extract-location-coordinates-beta |
| Document Split Beta 발표 | https://www.upstage.ai/blog/en/information-extract-document-split-beta |
| Demo 공개 안내 | https://www.upstage.ai/blog/en/demo-now-open-unleash-information-from-any-document |

### 제품 페이지 및 마켓플레이스

| 자료 | URL |
|------|-----|
| Information Extract 제품 페이지 | https://www.upstage.ai/products/information-extract |
| Upstage Console | https://console.upstage.ai |
| Playground (Universal Extraction) | https://console.upstage.ai/playground/universal-extraction |
| AWS Marketplace | https://aws.amazon.com/marketplace/pp/prodview-hr5o3uklhaeny |
| Azure Marketplace | https://azuremarketplace.microsoft.com/marketplace/apps/upstage-marketplace.information-extract |
| Snowflake Marketplace | https://app.snowflake.com/marketplace/listing/GZTHZ1WYHG1W/upstage-information-extract |

### API 가격

| 자료 | URL |
|------|-----|
| API 가격 정책 | https://www.upstage.ai/pricing/api |

---

## 부록: 빠른 시작 체크리스트

1. ✅ [Upstage Console](https://console.upstage.ai)에서 계정 생성 (가입 시 $10 무료 크레딧)
2. ✅ Dashboard > API Keys에서 API 키 생성
3. ✅ OpenAI Python SDK 설치: `pip install openai`
4. ✅ `base_url`을 `https://api.upstage.ai/v1/information-extraction`으로 설정
5. ✅ 추출할 필드를 JSON Schema로 정의 (또는 자동 생성 사용)
6. ✅ 문서 업로드 (base64 또는 URL)
7. ✅ 결과 수신 및 파싱 (`json.loads(response.choices[0].message.content)`)

---

*이 문서는 Upstage 공식 문서, 블로그, AWS Marketplace, 커뮤니티 리소스를 종합하여 작성되었습니다.*
