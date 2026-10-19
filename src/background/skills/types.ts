export interface Skill {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  isActive: boolean;
  isBuiltIn?: boolean;
}
