package app.diota;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Color;
import android.graphics.RenderEffect;
import android.graphics.Shader;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.SystemClock;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.PathInterpolator;
import android.widget.FrameLayout;
import android.widget.ImageView;

import java.util.ArrayList;
import java.util.List;

/**
 * The DioTa splash, drawn natively so it is on screen the instant the app icon is tapped (the
 * website loads behind it). It is the website's splash (src/components/Splash.tsx), frame for frame:
 * the same background, three soft drifting colour orbs, the wordmark letters rising in one by one
 * out of a blur, the gradient underline drawing in, and the same scale-and-fade exit.
 */
final class SplashView extends FrameLayout {
    /** Width of the wordmark in ems, and its share of the letter drawables (scripts/make-android-icon.mjs). */
    private static final float WORD_EM = 2.4764f;
    private static final float WORD_FRACTION = 62f / 108f;
    private static final int[] LIGHT_LETTERS = {R.drawable.splash_l0, R.drawable.splash_l1, R.drawable.splash_l2, R.drawable.splash_l3, R.drawable.splash_l4};
    private static final int[] DARK_LETTERS = {R.drawable.splash_d0, R.drawable.splash_d1, R.drawable.splash_d2, R.drawable.splash_d3, R.drawable.splash_d4};

    static final int BG_LIGHT = 0xFFF8F4FB; // --bg
    static final int BG_DARK = 0xFF0A070D;

    final long shownAt = SystemClock.uptimeMillis();
    private final List<Animator> loops = new ArrayList<>();
    private final float density;
    private boolean leaving;

    SplashView(Context c, boolean dark) {
        super(c);
        DisplayMetrics dm = getResources().getDisplayMetrics();
        density = dm.density;
        setBackgroundColor(dark ? BG_DARK : BG_LIGHT);
        setClickable(true); // nothing underneath can be tapped while it is showing
        setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        setLayerType(LAYER_TYPE_HARDWARE, null);

        // Orbs: var(--primary), var(--primary-2), var(--good) at 30% behind a 90px blur.
        int[] colors = dark ? new int[]{0xFFA24FF0, 0xFFCF3BD8, 0xFF3DDC97} : new int[]{0xFF8B35DE, 0xFFBF2BC9, 0xFF11975A};
        int[] sizes = {420, 360, 260};
        float[][] xs = {{-0.20f, 0.15f}, {0.20f, -0.15f}, {0f, 0.25f}};
        float[][] ys = {{-0.15f, 0.10f}, {0.15f, -0.10f}, {0.25f, -0.05f}};
        for (int i = 0; i < 3; i++) {
            float size = sizes[i] * density;
            float radius = size / 2f + 110 * density; // the blur spreads the circle this far
            GradientDrawable g = new GradientDrawable();
            g.setGradientType(GradientDrawable.RADIAL_GRADIENT);
            g.setGradientRadius(radius);
            int c0 = colors[i];
            g.setColors(new int[]{alpha(c0, 0.30f), alpha(c0, 0.22f), alpha(c0, 0.08f), alpha(c0, 0f)});
            View orb = new View(c);
            orb.setBackground(g);
            int px = Math.round(radius * 2);
            addView(orb, new LayoutParams(px, px, Gravity.CENTER));
            ObjectAnimator drift = ObjectAnimator.ofPropertyValuesHolder(orb,
                    PropertyValuesHolder.ofFloat(View.TRANSLATION_X, xs[i][0] * size, xs[i][1] * size),
                    PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, ys[i][0] * size, ys[i][1] * size));
            drift.setDuration((7 + i * 2) * 500L);
            drift.setRepeatCount(ValueAnimator.INFINITE);
            drift.setRepeatMode(ValueAnimator.REVERSE);
            drift.setInterpolator(new AccelerateDecelerateInterpolator());
            drift.start();
            loops.add(drift);
        }

        // The wordmark at the website's size: 26vw on phones, 8.5rem from 640px.
        float cssWidth = dm.widthPixels / density;
        float fontPx = (cssWidth >= 640 ? 136f : 0.26f * cssWidth) * density;
        float wordPx = fontPx * WORD_EM;
        int side = Math.round(wordPx / WORD_FRACTION);
        float glyphH = wordPx * (18.2f / 62f);
        float lift = 12.5f * density; // the column (word + 24px gap + underline) is what's centred
        PathInterpolator ease = new PathInterpolator(0.22f, 1f, 0.36f, 1f);
        int[] letters = dark ? DARK_LETTERS : LIGHT_LETTERS;
        for (int i = 0; i < letters.length; i++) {
            ImageView v = new ImageView(c);
            v.setImageResource(letters[i]);
            v.setScaleType(ImageView.ScaleType.FIT_XY);
            v.setAlpha(0f);
            v.setTranslationY(36 * density - lift);
            addView(v, new LayoutParams(side, side, Gravity.CENTER));
            ObjectAnimator in = ObjectAnimator.ofPropertyValuesHolder(v,
                    PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f),
                    PropertyValuesHolder.ofFloat(View.TRANSLATION_Y, 36 * density - lift, -lift));
            in.setStartDelay(150 + i * 120L);
            in.setDuration(900);
            in.setInterpolator(ease);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                final float maxBlur = 14 * density;
                in.addUpdateListener(a -> {
                    float r = maxBlur * (1f - a.getAnimatedFraction());
                    v.setRenderEffect(r < 0.5f ? null : RenderEffect.createBlurEffect(r, r, Shader.TileMode.DECAL));
                });
            }
            in.start();
            loops.add(in);
        }

        // Underline: 160px x 1px, transparent -> primary -> primary-2 -> transparent, drawn from the left.
        GradientDrawable lineBg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.TRANSPARENT, colors[0], colors[1], Color.TRANSPARENT});
        View line = new View(c);
        line.setBackground(lineBg);
        line.setAlpha(0f);
        line.setScaleX(0f);
        line.setPivotX(0f);
        LayoutParams lp = new LayoutParams(Math.round(160 * density), Math.max(1, Math.round(density)), Gravity.CENTER);
        addView(line, lp);
        line.setTranslationY(glyphH / 2f + 24 * density - lift);
        ObjectAnimator draw = ObjectAnimator.ofPropertyValuesHolder(line,
                PropertyValuesHolder.ofFloat(View.SCALE_X, 0f, 1f),
                PropertyValuesHolder.ofFloat(View.ALPHA, 0f, 1f));
        draw.setStartDelay(1100);
        draw.setDuration(1000);
        draw.setInterpolator(new DecelerateInterpolator());
        draw.start();
        loops.add(draw);
    }

    /** How long it has been on screen. */
    long elapsed() {
        return SystemClock.uptimeMillis() - shownAt;
    }

    /** Scale up, blur and fade away (0.6 s, as on the website), then remove itself. */
    void leave(Runnable done) {
        if (leaving) return;
        leaving = true;
        setClickable(false);
        ObjectAnimator out = ObjectAnimator.ofPropertyValuesHolder(this,
                PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0f),
                PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.08f),
                PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.08f));
        out.setDuration(600);
        out.setInterpolator(new PathInterpolator(0.4f, 0f, 0.2f, 1f));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            final float maxBlur = 12 * density;
            out.addUpdateListener(a -> {
                float r = maxBlur * a.getAnimatedFraction();
                setRenderEffect(r < 0.5f ? null : RenderEffect.createBlurEffect(r, r, Shader.TileMode.CLAMP));
            });
        }
        out.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                for (Animator a : loops) a.cancel();
                loops.clear();
                ViewGroup parent = (ViewGroup) getParent();
                if (parent != null) parent.removeView(SplashView.this);
                if (done != null) done.run();
            }
        });
        out.start();
    }

    private static int alpha(int color, float a) {
        return (Math.round(a * 255) << 24) | (color & 0x00FFFFFF);
    }
}
