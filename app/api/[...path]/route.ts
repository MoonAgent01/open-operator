import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_SERVER_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7789';

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  
  try {
    const response = await fetch(`${BRIDGE_SERVER_URL}/${path}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bridge forwarding error:', error);
    return NextResponse.json({ error: 'Failed to connect to bridge server' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/');
  const body = await request.json();
  
  try {
    const response = await fetch(`${BRIDGE_SERVER_URL}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Bridge forwarding error:', error);
    return NextResponse.json({ error: 'Failed to connect to bridge server' }, { status: 500 });
  }
}
