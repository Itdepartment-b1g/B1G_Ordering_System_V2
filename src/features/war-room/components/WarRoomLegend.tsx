import { Card } from '@/components/ui/card';
import { legendColors } from '../utils/markerColors';

export function WarRoomLegend() {
  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Pin Colors</h3>
      <div className="space-y-2">
        {legendColors.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-md"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

