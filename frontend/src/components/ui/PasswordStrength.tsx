import zxcvbn from 'zxcvbn';

const LEVELS = [
  { label: 'Very weak', color: 'bg-red-500' },
  { label: 'Weak', color: 'bg-orange-400' },
  { label: 'Fair', color: 'bg-yellow-400' },
  { label: 'Good', color: 'bg-lime-500' },
  { label: 'Strong', color: 'bg-green-500' },
];

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(password: string): Requirement[] {
  return [
    { label: 'At least 12 characters', met: password.length >= 12 },
    { label: 'Uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Number', met: /[0-9]/.test(password) },
    { label: 'Special character', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

interface Props {
  password: string;
}

export default function PasswordStrength({ password }: Props) {
  if (!password) return null;

  const { score } = zxcvbn(password);
  const level = LEVELS[score];
  const requirements = getRequirements(password);

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1 h-1.5">
        {LEVELS.map((l, i) => (
          <div
            key={l.label}
            className={`flex-1 rounded-full transition-colors duration-300 ${
              i <= score ? level.color : 'bg-gray-200'
            }`}
          />
        ))}
      </div>
      <p className="text-xs font-medium text-gray-500">
        Strength: <span className={score >= 3 ? 'text-green-600' : score >= 2 ? 'text-yellow-600' : 'text-red-600'}>{level.label}</span>
      </p>

      {/* Requirements checklist */}
      <ul className="space-y-0.5">
        {requirements.map((r) => (
          <li key={r.label} className="flex items-center gap-1.5 text-xs">
            <span className={r.met ? 'text-green-500' : 'text-gray-400'}>
              {r.met ? '✓' : '○'}
            </span>
            <span className={r.met ? 'text-gray-700' : 'text-gray-400'}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
