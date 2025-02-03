import { useLoggedInStatus } from '@/components/hooks/logged-in-status';
import { useOnlineStatus } from '@/components/hooks/online-status';
import { LoginButton } from '@/components/profile/loginout';
import { LogoutButton } from '@/components/profile/logout-button';
import OfflineUsageDialog from '@/components/profile/offline-usage-dialog';
import { StatsLinkButton } from '@/components/profile/stats-link-button';
import { SiGithub } from '@icons-pack/react-simple-icons';
import { Link } from 'react-router';

export default function ProfileRoute() {
  const online = useOnlineStatus();
  const loggedIn = useLoggedInStatus();

  return (
    <div className='flex flex-col h-full col-start-1 col-end-13 xl:col-start-3 xl:col-end-11 md:px-24 pb-6 gap-2'>
      <h1 className='mt-10 scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight transition-colors first:mt-0'>
        Profile
      </h1>
      <StatsLinkButton />

      {!online && <OfflineUsageDialog />}
      {loggedIn.isLoggedIn ? <LogoutButton /> : <LoginButton />}

      <Link
        to='https://github.com/zsh-eng'
        className='mx-auto mt-auto'
        target='_blank'
      >
        <div className='group flex text-muted-foreground gap-2 mt-24'>
          <SiGithub className='' />
          <span className='group-hover:text-primary transition-all ease-out'>
            made by zsh-eng
          </span>
        </div>
      </Link>
    </div>
  );
}
