import React from 'react';
import { Zap, Check } from 'lucide-react';
import { Skill } from '../../background/skills/types';

interface SkillSelectorProps {
  skills: Skill[];
  onToggleSkill: (skillId: string) => void;
}

export const SkillSelector: React.FC<SkillSelectorProps> = ({ skills, onToggleSkill }) => {
  return (
    <div className="px-3 py-2 bg-slate-950/60 border-b border-slate-800/80">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Zap className="w-3 h-3 text-amber-400" />
        <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Agent Skills
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <button
            key={skill.id}
            onClick={() => onToggleSkill(skill.id)}
            title={skill.description}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${
              skill.isActive
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'bg-slate-800/60 text-slate-400 border border-slate-700/50 hover:bg-slate-800 hover:text-slate-300'
            }`}
          >
            {skill.isActive && <Check className="w-2.5 h-2.5" />}
            {skill.name}
          </button>
        ))}
      </div>
    </div>
  );
};
