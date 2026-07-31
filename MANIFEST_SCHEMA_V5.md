# Content Creator v5.0.0 Manifest Schema

## Overview

The v5.0.0 manifest uses a **Topics → Sections** hierarchy with Do's/Don'ts format for policies and procedures content.

## Schema Structure

```typescript
interface ManifestV5 {
  version: "5.0.0";
  locked: boolean;
  lockedAt: string; // ISO timestamp
  inputHash: string;
  
  // Context from input
  context: {
    topic: string;           // Main content topic
    unitCode?: string;       // TGA unit code
    unitTitle?: string;      // TGA unit title
    mode: "VET" | "University";
  };
  
  // Topics array (displayed as cards in Topics Grid)
  topics: Topic[];
  
  // Progress tracking
  progress?: {
    totalSections: number;
    completedSections: number;
    lastVisited?: string;    // Topic ID
    lastUpdated?: string;    // ISO timestamp
  };
}

interface Topic {
  id: string;                // Unique ID (e.g., "ppe", "housekeeping")
  title: string;             // Display title
  shortTitle?: string;       // For navigation pills
  description: string;       // Card description (2 lines max)
  icon: string;              // Lucide icon name
  color: ColorTheme;         // Theme color
  priority?: boolean;        // Highlight on grid
  sections: Section[];       // Sections within topic
}

interface Section {
  id: string;                // Unique ID
  title: string;             // Section title
  shortTitle?: string;       // For navigation pills
  description?: string;      // Optional intro paragraph
  icon: string;              // Lucide icon name
  color?: ColorTheme;        // Override topic color
  
  // Requirements grid (key points)
  requirements: Requirement[];
  
  // Do's and Don'ts lists
  doList: string[];
  dontList: string[];
  
  // Optional activity (Phase 2)
  activity?: Activity;
  
  // Voiceover (Phase 3)
  voiceover?: {
    generated: boolean;
    audioUrl?: string;
    duration?: number;       // seconds
  };
}

interface Requirement {
  icon: string;              // Lucide icon name
  text: string;              // Requirement text
  required?: boolean;        // true = mandatory
}

interface Activity {
  type: ActivityType;
  question?: string;         // Activity prompt
  items?: ActivityItem[];    // Activity-specific items
  correctAnswer?: any;       // Varies by type
}

type ActivityType = 
  | "scenario-decision"      // Judgment content
  | "behaviour-sort"         // Do's/Don'ts content
  | "sequence-order"         // Procedure content
  | "spot-issue"             // Hazard content
  | "requirement-match";     // Situations content

type ColorTheme = 
  | "primary"   // Blue
  | "blue"
  | "green"
  | "amber"
  | "rose"
  | "purple"
  | "red"
  | "yellow"
  | "teal"
  | "gray";
```

## Example Manifest

```json
{
  "version": "5.0.0",
  "locked": true,
  "lockedAt": "2025-12-23T10:00:00.000Z",
  "inputHash": "abc123",
  "context": {
    "topic": "Workplace Safety",
    "unitCode": "BSBWHS411",
    "unitTitle": "Implement and monitor WHS policies, procedures and programs",
    "mode": "VET"
  },
  "topics": [
    {
      "id": "ppe",
      "title": "Personal Protective Equipment",
      "shortTitle": "PPE",
      "description": "Mandatory protective equipment requirements for all workshop activities.",
      "icon": "hard-hat",
      "color": "primary",
      "priority": true,
      "sections": [
        {
          "id": "ppe-1",
          "title": "Eye Protection",
          "shortTitle": "Eyes",
          "description": "Safety glasses must be worn at all times in work areas.",
          "icon": "glasses",
          "requirements": [
            { "icon": "check-circle", "text": "ANSI Z87.1 rated safety glasses required", "required": true },
            { "icon": "eye", "text": "Face shields for grinding operations", "required": true }
          ],
          "doList": [
            "Inspect glasses before each use",
            "Keep lenses clean",
            "Store in protective case",
            "Replace if scratched"
          ],
          "dontList": [
            "Use prescription glasses as PPE",
            "Wear damaged safety glasses",
            "Remove in active work areas",
            "Share personal eye protection"
          ],
          "activity": {
            "type": "scenario-decision",
            "question": "A colleague asks to borrow your safety glasses. What should you do?"
          }
        }
      ]
    },
    {
      "id": "housekeeping",
      "title": "Housekeeping Standards",
      "shortTitle": "Housekeeping",
      "description": "Maintaining a clean and organised workspace for safety and efficiency.",
      "icon": "sparkles",
      "color": "green",
      "sections": []
    }
  ]
}
```

## Activity Types Assignment Rules

Activities are auto-assigned based on content type:

| Content Type | Activity Type | Description |
|--------------|---------------|-------------|
| Judgment/Ethics | `scenario-decision` | Workplace scenarios requiring judgment calls |
| Do's/Don'ts | `behaviour-sort` | Sort behaviours into correct/incorrect categories |
| Procedures/Steps | `sequence-order` | Arrange steps in correct order |
| Hazards/Risks | `spot-issue` | Identify problems in workplace images |
| Situations/Requirements | `requirement-match` | Match requirements to situations |

## Icon Reference

Common icons used in sections:

- `shield` - General safety
- `hard-hat` - Head protection
- `glasses` - Eye protection
- `ear` - Hearing protection
- `hand` - Hand protection
- `sparkles` - Housekeeping
- `wrench` - Equipment
- `alert-triangle` - Emergency
- `droplets` - Chemicals
- `zap` - Electrical
- `flame` - Fire safety
- `users` - Conduct

## Color Theme Usage

| Theme | Usage |
|-------|-------|
| `primary` | Default, PPE |
| `blue` | Conduct, procedures |
| `green` | Housekeeping, positive actions |
| `amber` | Equipment, caution |
| `rose` | Bullying, prohibited actions |
| `purple` | Chemicals, specialized |
| `red` | Emergency, critical |
| `yellow` | Electrical, warning |
| `teal` | Membership, inclusion |
| `gray` | Privacy, governance |
