# Upstage AI - Document Parse Capability

## 1. 개요

**Upstage Document Parse**는 복잡한 문서를 LLM(대규모 언어 모델)이 처리할 수 있는 구조화된 형식(HTML, Markdown)으로 변환하는 AI 문서 파싱 엔진입니다. PDF, 스캔 이미지, 스프레드시트, 슬라이드 등 다양한 문서 형식에서 텍스트, 테이블, 차트, 수필 요소를 정확하게 추출합니다.

- **API Endpoint**: `https://api.upstage.ai/v1/document-digitization`
- **모델명**: `document-parse` (기본), `document-parse-nightly` (Enhanced mode beta)
- **가격**: $0.01/page (API), AWS Marketplace $17/hour 또는 $3k/month
- **인증**: SOC2 & ISO 27001 인증

---

## 2. 처리 모드 (Processing Modes)

Document Parse는 3가지 처리 모드를 지원합니다:

| 모드 | 파라미터 값 | 설명 |
|------|------------|------|
| **Standard** | `mode=standard` | 일반 문서 파싱 작업용. 텍스트와 테이블 중심 처리 |
| **Enhanced** | `mode=enhanced` | 복잡한 테이블, 차트, 다이어그램, 체크박스가 포함된 문서용. VLM(Vision Language Model) 활용 |
| **Auto** | `mode=auto` | 페이지별 복잡도를 자동 분석하여 Standard 또는 Enhanced 모드로 라우팅. 정확도와 비용 최적화 |

### Enhanced Mode 주요 기능
- **복잡한 테이블**: 멀티라인 셀, 선 없는 테이블, 멀티페이지 테이블 인식
- **차트**: 구조화된 데이터 + 자연어 설명으로 변환
- **이미지/다이어그램**: 간결한 기계 판독 가능 설명으로 요약
- **체크박스**: 체크됨/체크 안 됨 상태 감지

---

## 3. API 파라미터

### Request (multipart/form-data)

| 파라미터 | 타입 | 기본값 | 설명 |
|---------|------|--------|------|
| `document` | file | (필수) | 파싱할 문서 파일 |
| `model` | string | `document-parse` | 사용할 모델 (`document-parse`, `document-parse-nightly`) |
| `ocr` | string | `auto` | OCR 모드. `auto`: PDF에서 텍스트 추출, `force`: 이미지에서 OCR 강제 사용 |
| `output_format` | string | `html` | 출력 형식. `html` 또는 `text` |
| `coordinates` | boolean | `true` | OCR 좌표 정보 포함 여부 |
| `split` | string | `none` | 결과 분할 방식. `none`, `page`, `element` |
| `chart_recognition` | boolean | `true` | 차트 인식 활성화 여부 |
| `base64_encoding` | list | `null` | Base64 인코딩할 요소 카테고리 목록 |
| `mode` | string | - | 처리 모드: `standard`, `enhanced`, `auto` |

### Response (JSON)

응답은 `elements` 배열을 포함하며, 각 요소는 다음 필드를 가집니다:

```json
{
  "elements": [
    {
      "id": 0,
      "page": 1,
      "category": "paragraph",
      "html": "<p>텍스트 내용</p>",
      "text": "텍스트 내용",
      "coordinates": {
        "x": 100,
        "y": 200,
        "width": 400,
        "height": 50
      },
      "base64_encoding": "..."
    }
  ]
}
```

### 요소 카테고리 (Element Categories)

| 카테고리 | 설명 |
|---------|------|
| `paragraph` | 일반 텍스트 단락 |
| `table` | 테이블 |
| `figure` | 이미지/그림 |
| `chart` | 차트 (Enhanced mode에서 chart_type, chart_description 포함) |
| `header` | 페이지 헤더 |
| `footer` | 페이지 푸터 |
| `caption` | 캡션 |
| `equation` | 수식 |

---

## 4. API Quickstart

### cURL

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F "document=@./test.pdf" \
  -F "model=document-parse" \
  -F "ocr=auto" \
  https://api.upstage.ai/v1/document-digitization
```

### Python (LangChain)

```python
from langchain_upstage import UpstageDocumentParseLoader

loader = UpstageDocumentParseLoader(
    "file_path",
    split="page",
    output_format="html",
    ocr="force",
    coordinates=True,
    chart_recognition=True
)
docs = loader.load()
```

### Python (LlamaIndex)

```python
from llama_index.readers.upstage import UpstageDocumentParseReader

reader = UpstageDocumentParseReader(
    api_key="YOUR_API_KEY",
    split="page",
    ocr="auto",
    output_format="html",
    coordinates=True,
    base64_encoding=[]
)
docs = reader.load_data("path/to/file.pdf")
```

---

## 5. 입력 요구사항 (Input Requirements)

### 지원 파일 형식
- **PDF** (디지털 및 스캔)
- **이미지**: JPG, JPEG, PNG, BMP, TIFF
- **Office 파일**: DOCX, PPTX, XLSX
- **한글 파일**: HWP, HWPX (한국에서 일반적으로 사용)

### OCR 모드 동작
- `ocr=auto`: PDF 파일에서 내장된 텍스트 레이어를 우선 사용. PDF가 아닌 입력은 에러 발생
- `ocr=force`: 모든 입력에 대해 OCR을 강제 적용 (스캔 문서, 이미지 필수)

### 대용량 문서 처리
- 100페이지를 1분 이내 처리
- 500+ 페이지 문서 지원
- 긴 이미지(클레임 양식, 메시지 로그 등) 최적화된 patchify 로직으로 2배 빠른 처리

---

## 6. 출력 이해 (Understanding Output)

### 출력 형식 옵션

| 형식 | 설명 |
|------|------|
| `html` | HTML 태그 기반 구조화 출력 (기본값). 테이블은 `<table>` 태그로, 헤더는 `<h1>`~`<h6>` 태그 사용 |
| `text` | 일반 텍스트 형식 출력 |

### Split 옵션

| Split 타입 | 설명 |
|-----------|------|
| `none` | 전체 문서를 하나의 결과로 반환 |
| `page` | 페이지 단위로 분할하여 반환 |
| `element` | 각 레이아웃 요소 단위로 분할하여 반환 |

### 좌표 정보
`coordinates=true` 설정 시 각 요소의 바운딩 박스 좌표가 포함됩니다.

### Enhanced Mode 차트 출력 예시

```html
<figure data-category='chart'>
  <img data-coord="top-left:(23,100); bottom-right:(565,266)" />
  <figurecaption>
    <chart_type>bar chart</chart_type>
    <chart_description>The bar chart displays cumulative vaccination coverage percentages across six areas...</chart_description>
  </figurecaption>
</figure>
```

---

## 7. Chart Recognition (차트 인식)

Document Parse는 정적 차트 비주얼을 HTML과 같은 구조화된 텍스트로 변환합니다.

### 주요 특징
- 파이 차트, 바 차트, 라인 차트 등 다양한 차트 유형 지원
- 차트를 구조화된 데이터로 변환 후 LLM에 전달
- Chart-related Document QA 작업에서 경쟁사 대비 **6.49% 정확도 향상**
- LlamaParse 대비 **최대 13배 빠른** 처리 속도

### 활성화 방법
```python
# LangChain
loader = UpstageDocumentParseLoader("file.pdf", chart_recognition=True)

# API
-F "chart_recognition=true"
```

---

## 8. Multi-page Table Merge (멀티페이지 테이블 병합)

여러 페이지에 걸친 대형 테이블을 자동으로 감지하고 하나의 구조화된 테이블로 병합합니다.

### 주요 특징
- Layout Table Recognizer로 멀티페이지 테이블 자동 감지
- 재무 보고서, 보험 양식 등에 특히 유용
- Enhanced mode에서 실질적으로 낮은 레이턴시로 높은 병합 정확도 달성

---

## 9. 대용량 문서 처리 (Handling Large Documents)

### 처리 전략
- PDF 문서는 내부적으로 페이지 단위로 분할하여 API에 전송
- 기본 배치 크기(DEFAULT_NUMBER_OF_PAGE)로 자동 분할
- 긴 이미지 문서에 대한 최적화된 리사이징 및 패치 리듀션

### 권장사항
- 소형 문서 (< 20 페이지): 단일 요청으로 처리
- 대형 문서: 자동 페이지 분할 처리

---

## 10. 성능 벤치마크

### 속도
- **평균 0.6초/페이지**
- 100페이지를 1분 이내 처리
- Unstructured, AWS Textract 대비 **5~10배 빠름**
- LlamaParse 대비 **4배 빠름**

### 정확도 (DP-Bench 벤치마크)
- **TEDS**: 93.48
- **TEDS-S**: 94.16
- Google, Microsoft 대비 문서 레이아웃 및 테이블 구조 인식에서 **5% 이상 높은 정확도**

---

## 11. 최근 업데이트 (document-parse-250404)

### 2025년 4월 업데이트
1. **폼 기반 문서의 테이블 인식 개선**: 다중 열, 비정형 구조, 레이어 섹션 처리 향상
2. **멀티페이지 테이블 스티칭**: 여러 페이지에 걸친 테이블을 단일 구조로 병합
3. **Document Parse 360°**: 90°, -90°, 180° 회전된 입력 및 약간 기울어진 스캔 처리
4. **긴 이미지 2배 빠른 처리**: patchify 로직 최적화, GPU 튜닝
5. **HWP 변환 지원**: `.hwp`, `.hwpx` 파일 자동 변환 처리
6. **스마트 `ocr=auto`**: 복잡한 문서를 자동으로 분할 및 구조화

---

## 12. Document OCR

Document Parse의 OCR 기능은 레이아웃 분석과 텍스트 인식을 결합합니다.

### OCR 모드
- **auto**: PDF에서 텍스트 레이어가 있으면 추출, 없으면 OCR 적용
- **force**: 항상 OCR 사용 (스캔 이미지, 사진 문서에 적합)

---

## 13. 배포 옵션

| 옵션 | 설명 |
|------|------|
| **REST API** | Upstage Console을 통한 직접 API 호출 |
| **AWS Marketplace** | AWS Marketplace 및 SageMaker JumpStart 배포 |
| **On-premise** | 베어메탈 서버에 모델 설치 (별도 문의) |
| **LangChain 통합** | `langchain_upstage` 패키지 |
| **LlamaIndex 통합** | `llama-index-readers-upstage` 패키지 |
| **Dify 플러그인** | Dify 플랫폼 마켓플레이스 |

---

## 14. 사용 사례

- **RAG (Retrieval-Augmented Generation)**: 복잡한 문서를 LLM 친화적 형식으로 변환하여 정밀한 검색
- **문서 요약**: 보고서, 계약서, 논문에서 자동 요약 생성
- **법률/컴플라이언스**: 법률 문서, 규제 문서 디지털화
- **재무 보고서 처리**: 테이블, 차트, 텍스트 레이아웃 보존
- **보험 업무**: 청구서, 양식 자동 처리

---

## 15. Tips & FAQ

### 최적의 결과를 위한 팁
- 스캔 문서에는 반드시 `ocr=force` 사용
- 차트가 많은 문서에는 `chart_recognition=true` 활성화
- RAG 파이프라인에서는 `split="page"` 또는 `split="element"` 권장
- 복잡한 시각적 요소가 많은 문서에는 Enhanced mode 사용

### 주요 제한사항
- `ocr=auto`는 PDF 전용 (이미지 입력 시 에러 발생)
- Enhanced mode는 현재 beta (`document-parse-nightly` 모델 사용)

---

## 참조 링크

- [Document Parse 제품 페이지](https://www.upstage.ai/products/document-parse)
- [API 문서](https://console.upstage.ai/docs/capabilities/parse)
- [Playground](https://console.upstage.ai/playground/document-parse)
- [DP-Bench 벤치마크](https://huggingface.co/datasets/upstage/dp-bench)
- [AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-lv5bnpdco7xoq)
- [LangChain 통합](https://python.langchain.com/docs/integrations/providers/upstage/#document-parse)
- [GitHub Cookbook](https://github.com/UpstageAI/cookbook)
