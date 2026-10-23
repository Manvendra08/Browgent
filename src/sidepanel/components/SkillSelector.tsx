import React, { useState } from 'react';
import { Zap, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Skill } from '../../background/skills/types';

interface SkillSelectorProps {
  skills: Skill[];
  onToggleSkill: (skillId: string) => void;
}

export const SkillSelector: React.FC<SkillSelectorProps> = ({ skills, onToggleSkill }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const activeCount = skills.filter((s) => s.isActive).length;

  return (
    <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 text-[11px]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition font-medium cursor-pointer"
          aria-expanded={isExpanded}
        >
          <Zap className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-semibold tracking-wider uppercase">
            Skills ({activeCount} active)
          </span>
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronRight className="w-3 h-3 text-slate-400" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-1 border-t border-slate-800/60">
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
      )}
    </div>
  );
};
