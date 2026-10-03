# Fresco Markdown

A calm place to read **architecture**, write *ideas*, and inspect `code`.

> The live preview opens automatically and renders these diagrams.
> Reopen it with **Ctrl+P → Fresco Markdown: Open Live Preview** if you close it.
> This gallery contains **24 diagrams** across five supported families.
> Widen the preview pane if a diagram falls back to its source.

Start with the architecture and conversation below, then explore flowcharts,
sequences, state machines, class models, and entity relationships.
Change any node label in the source to demonstrate live updates.

## Architecture

```mermaid
flowchart TD
    A[Markdown source] --> B[Native renderer]
    B --> C[Styled text]
    B --> D[Mermaid diagrams]
    C --> E[Fresco preview]
    D --> E
```

## A conversation

```mermaid
sequenceDiagram
    participant Author
    participant Fresco
    Author->>Fresco: Edit Markdown
    Fresco-->>Author: Refresh preview
```

## Flowchart gallery

### 1. A decision with two outcomes

Diamond-shaped decisions and labeled edges make a small review process readable.

```mermaid
flowchart TD
    A[Open change] --> B{Tests pass?}
    B -->|Yes| C[Review]
    B -->|No| D[Fix code]
    C --> E[Merge]
    D --> B
```

### 2. A left-to-right pipeline

```mermaid
flowchart LR
    A[Read] --> B[Parse]
    B --> C[Render]
    C --> D[Display]
```

### 3. Parallel checks converge

```mermaid
flowchart TD
    A[Commit] --> B[Lint]
    A --> C[Test]
    A --> D[Build]
    B --> E[Release]
    C --> E
    D --> E
```

### 4. Service boundaries

Subgraphs draw labeled frames around related components.

```mermaid
flowchart TD
    subgraph api [API]
        A[Router] --> B[Handler]
    end
    subgraph storage [Storage]
        C[Cache] --> D[Database]
    end
    api --> storage
```

### 5. A retry cycle

```mermaid
flowchart TD
    A[Request] --> B{Ready?}
    B -->|Yes| C[Return]
    B -->|No| D[Back off]
    D --> A
```

### 6. Different edge styles

Solid, dotted, and thick connections distinguish data, notification, and critical paths.

```mermaid
flowchart TD
    A[Editor] --> B[Buffer]
    B -.-> C[Preview]
    B ==> D[Save]
```

### 7. Bottom-up dependencies

```mermaid
flowchart BT
    A[Storage] --> B[Services]
    B --> C[Application]
    C --> D[Interface]
```

### 8. A self-loop

```mermaid
flowchart TD
    A[Worker] -->|Poll| A
    A -->|Job| B[Execute]
    B --> C[Result]
```

## Sequence gallery

### 9. A login round trip

Aliases give short participant identifiers readable display names.

```mermaid
sequenceDiagram
    participant U as User
    participant A as Auth
    U->>A: Sign in
    A->>A: Check password
    A-->>U: Session token
```

### 10. A cache hit or miss

```mermaid
sequenceDiagram
    participant App
    participant Cache
    App->>Cache: Read key
    alt Hit
        Cache-->>App: Value
    else Miss
        Cache-->>App: Not found
        App->>App: Load from disk
        App->>Cache: Store value
    end
```

### 11. Numbered retry attempts

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant API
    loop Until ready
        Client->>API: Request
        API-->>Client: Status
    end
    Note over Client,API: Stop after success
```

### 12. Background work

```mermaid
sequenceDiagram
    participant UI
    participant Worker
    UI->>Worker: Start job
    Worker-->>UI: Accepted
    Worker->>Worker: Process
    Worker-->>UI: Finished
```

### 13. A guarded operation

```mermaid
sequenceDiagram
    participant Client
    participant Store
    critical Commit
        Client->>Store: Write batch
        Store-->>Client: Saved
    option Unavailable
        Client->>Client: Keep draft
    end
```

## State-machine gallery

### 14. An editable document

Start and end markers show the complete document lifecycle.

```mermaid
stateDiagram-v2
    [*] --> Clean
    Clean --> Modified: type
    Modified --> Saving: save
    Saving --> Clean: success
    Saving --> Modified: failure
    Clean --> [*]: close
```

### 15. A deployment

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Building
    Building --> Testing
    Testing --> Live: pass
    Testing --> Failed: fail
    Failed --> Queued: retry
    Live --> [*]
```

### 16. A background worker

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Busy: job
    Busy --> Idle: complete
    Busy --> Retrying: error
    Retrying --> Busy: retry
    Idle --> Stopped: shutdown
    Stopped --> [*]
```

### 17. A review decision

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Approved: accept
    Review --> Changes: revise
    Changes --> Draft
    Approved --> [*]
```

## Class-model gallery

### 18. A plugin contract

Class compartments separate fields and methods; inheritance connects implementations.

```mermaid
classDiagram
    class Plugin {
        +String name
        +activate()
        +dispose()
    }
    class MarkdownPlugin {
        +render()
    }
    Plugin <|-- MarkdownPlugin
```

### 19. A document owns its buffer

A filled diamond represents composition.

```mermaid
classDiagram
    class Document {
        +String path
        +save()
    }
    class Buffer {
        +String text
        +insert()
        +delete()
    }
    Document *-- Buffer : owns
```

### 20. An interchangeable renderer

```mermaid
classDiagram
    <<interface>> Renderer
    Renderer : +render()
    class TextRenderer {
        +render()
    }
    Renderer <|.. TextRenderer
```

## Entity-relationship gallery

### 21. Projects and documents

Relationship labels include cardinality; entity boxes list fields and keys.

```mermaid
erDiagram
    PROJECT ||--o{ DOCUMENT : contains
    PROJECT {
        int id PK
        string name
    }
    DOCUMENT {
        int id PK
        int project_id FK
        string path
    }
```

### 22. Customers and orders

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDERS : places
    CUSTOMER {
        int id PK
        string email
    }
    ORDERS {
        int id PK
        int customer_id FK
        string status
    }
```

## Markdown details

| Feature | Behavior |
| --- | --- |
| Markdown | Headings, emphasis, lists and tables |
| Mermaid | Native terminal text |
| Editing | Source stays editable |
| Preview | Updates while you type |

- [x] Preserve source files
- [x] Render without a browser
- [ ] Write the next chapter

Inline math: $E=mc^2$.

```rust
fn main() {
    println!("Hello, Fresco!");
}
```
