import {createRecord} from '@/lib/live-mutations';
export async function POST(request: Request) {
  return createRecord(request, 'website');
}
