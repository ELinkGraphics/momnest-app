interface AppLoaderProps {
  fadeOut?: boolean;
}

export const AppLoader = ({ fadeOut = false }: AppLoaderProps) => {
  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        backgroundImage: 'url(/lovable-uploads/Splash%20Screen%20Background.svg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'hsl(19 55% 28%)',
      }}
    >
      {/* Overlay logo */}
      <div className="flex-1 flex items-center justify-center w-full px-8">
        <img
          src="/lovable-uploads/SerkleLogoMarkWhiteColor.svg"
          alt="Serkle"
          className="splash-image w-full max-w-[280px] sm:max-w-[320px] h-auto object-contain"
        />
      </div>

      {/* Animated gradient Loading text */}
      <div className="pb-16">
        <p className="splash-loading-text text-lg font-semibold tracking-wide">
          Loading
        </p>
      </div>
    </div>
  );
};
