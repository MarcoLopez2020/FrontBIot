// src/components/RoleSelector.tsx
import React from 'react';

const ROLES = [
  { id: 'owner', label: 'Owner / Admin' },
  { id: 'company', label: 'Company' },
  { id: 'government', label: 'Government' },
];

export function RoleSelector({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {ROLES.map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={
            'px-4 py-2 rounded-full text-sm ' +
            (value === r.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-300')
          }
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
