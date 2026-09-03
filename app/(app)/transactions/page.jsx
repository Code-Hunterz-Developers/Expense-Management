'use client';

import { Suspense } from 'react';
import Transactions from '@/components/Transactions';

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="empty-state"><p>Loading...</p></div>}>
      <Transactions />
    </Suspense>
  );
}
