import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

type SearchBarProps = {
  search: string;
  setSearch: (search: string) => void;
  placeholder?: string;
};

export default function SearchBar({
  search,
  setSearch,
  placeholder = 'Search...',
}: SearchBarProps) {
  return (
    <div className='relative w-full max-w-sm col-span-12 mb-6 sm:mb-8 mx-auto'>
      <Button
        variant='ghost'
        size='icon'
        className='absolute left-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent shadow-none'
      >
        <Search className='h-4 w-4' />
      </Button>
      <Input
        className='px-12 h-12'
        type='text'
        placeholder={placeholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {search && (
        <Button
          variant='ghost'
          size='icon'
          className='absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-transparent shadow-none'
          onClick={() => setSearch('')}
        >
          <X className='h-4 w-4' />
        </Button>
      )}
    </div>
  );
}
