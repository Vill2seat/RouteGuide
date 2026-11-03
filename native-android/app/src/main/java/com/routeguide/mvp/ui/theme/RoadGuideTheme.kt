package com.routeguide.mvp.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val RoadGuideColors = lightColorScheme(
    primary = Color(0xFF23644F),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFD8EBDD),
    onPrimaryContainer = Color(0xFF163D30),
    secondary = Color(0xFF53665B),
    background = Color(0xFFF7F9F7),
    surface = Color.White,
    surfaceVariant = Color(0xFFE9EFEA),
    onSurface = Color(0xFF1E2B24),
    onSurfaceVariant = Color(0xFF5C6B61),
)

@Composable
fun RoadGuideTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RoadGuideColors,
        content = content,
    )
}
